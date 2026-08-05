---
layout: doc
title: PSI5 协议学习手册：从原理到 L9663 调试
description: 从两线供电复用、Manchester 编码、帧与 CRC，到同步时隙、L9663 配置和波形定位的 PSI5 工程笔记。
tags:
  - PSI5
  - L9663
  - 汽车传感器
  - Manchester
  - 芯片调试
---

# PSI5 协议学习手册：从原理到 L9663 调试

> 简介：这是一份面向汽车远端传感器、MEMS、嵌入式和芯片 AE/FAE 工程师的学习与 bring-up 笔记。重点不是逐页翻译某颗芯片的数据手册，而是建立一条从线束波形到 MCU 数据的完整证据链。

## 先记住这一句话

PSI5 用一对导线给远端传感器供电：ECU -> 传感器主要通过抬高线电压产生同步或命令脉冲；传感器 -> ECU 则通过改变取电电流发送 Manchester 编码数据。

这解释了 PSI5 最容易误判的地方：只看电压，往往只能看到供电和 SYNC；想看清上行数据，必须观察线路电流、低阻分流电阻的差分压降，或收发器已经恢复出的数字信号。

## 使用边界

本文把协议通用内容与 L9663 专用内容分开讨论。不同传感器支持的模式、位宽、同步周期、初始化阶段和编程命令并不完全相同；最终配置必须回到目标传感器的数据手册和具体采购料号。

本文以常见 PSI5 v1.3/v2.x 框架为主，L9663 的器件能力只代表“芯片支持的选项”，不代表某个 PSI5 子标准要求所有选项都必须使用。

## 1. 建立正确的心智模型

PSI5（Peripheral Sensor Interface 5）是面向汽车远端传感器的数字接口。典型应用包括安全气囊加速度计、压力传感器，以及动力总成、底盘、位置和角度传感器。

它的核心价值不是追求超高带宽，而是在较低线束成本下同时实现：

- 远端供电；
- 确定性同步和时隙组织；
- 对线束噪声较强的抗扰能力；
- 传感器和链路诊断。

![PSI5 典型系统架构：MCU 通过主收发器连接远端传感器](/images/hardware/psi5-l9663-guide/system-architecture.svg)

*图 1：MCU 通常不直接接传感器线，而是通过专用 PSI5 主收发器隔离数字接口与线束物理层。*

### 1.1 PSI5 不是 UART，也不是 CAN

| 接口 | 物理信号 | 是否复用供电 | 典型通信组织 | 关键差异 |
| --- | --- | --- | --- | --- |
| PSI5 | 下行电压脉冲 + 上行电流调制 | 是 | 周期同步、时隙或异步 | 面向远端传感器，使用 Manchester |
| UART | 逻辑电平 TX/RX | 否 | 点对点异步字节流 | 通常需要独立供电与地 |
| LIN | 单线电压总线 | 否 | 主从调度帧 | 更通用，但速率更低 |
| CAN | 差分电压 | 否 | 多主仲裁消息 | 网络化、协议开销更大 |
| SENT | 单线脉宽编码 | 否 | 传感器单向周期帧 | 发送端用脉宽表示 nibble |
| A2B / TDM | 差分链路或同步数字音频 | 视实现而定 | 音频多通道、双向网络 | 与 PSI5 的电流调制和短帧时隙不同 |

### 1.2 同一对线如何分工

- 下行：ECU 抬高供电线电压，形成同步或命令脉冲。
- 上行：传感器在静态电流 `Iq` 的基础上叠加调制电流 `dI`，主收发器检测相对基线的变化。
- 静态时：主节点给传感器提供预稳压电源，传感器持续消耗静态电流 `Iq`。

这不是“电压高低双向抢总线”，而是电压域与电流域分工。板级调试时，串入过大的取样电阻会偷走传感器供电裕量并扭曲波形；电流探头或小阻值分流电阻通常更合适。

## 2. 协议分层：从线束到传感器数值

工程上可以把 PSI5 拆成三层：

| 层级 | 解决的问题 | 主要对象 |
| --- | --- | --- |
| 物理层 | 电压、电流、边沿、线束和抗扰 | `VPSI`、`Iq`、`dI`、SYNC、线容、地偏移 |
| 数据链路层 | bit、帧、校验、时隙和错误 | Manchester、S1/S2、数据区、Parity/CRC、slot |
| 应用与消息层 | 数据含义、初始化、状态和命令 | 量程、缩放、Status、Frame Control、Messaging、编程模式 |

“CRC 错”不一定是 CRC 算法错。电流阈值不合适、Manchester 中点丢边沿、帧长度配置错误或时隙跨界，都可能最终表现为校验失败。定位时应先验证物理层，再验证编码和帧，最后检查软件。

常见角色名称如下：

- `ECU / Master / Leader`：提供电源、产生同步或命令脉冲、接收传感器电流调制。
- `Sensor / Satellite / Slave / Follower`：远端传感器节点，接收供电与同步，并在配置的时隙中返回数据。
- `PSI5 Transceiver`：位于 ECU 内，把传感器线的高压或大电流物理层与 MCU 数字接口隔开。L9663 就属于这一角色。

## 3. 物理层：电压同步与电流回传

在典型同步系统中，主节点持续给传感器供电。需要采样时，主节点在线上产生一个正向 SYNC 电压脉冲；传感器识别该脉冲后开始计时，在自己的响应起始时间到达时，用电流调制发送帧。

### 3.1 关键电气量

| 量 | 含义 | 在波形上怎么理解 | 调试注意 |
| --- | --- | --- | --- |
| `VPSI / VBUS` | 传感器线电压 | 直流基线加正向 SYNC 脉冲 | 绝对值依主收发器和传感器范围而定 |
| `Iq / IBase` | 所有节点的静态取电电流 | 数据空闲时的基线电流 | 并联节点越多，基线越高 |
| `IMOD / dI` | 传感器的调制电流 | Manchester 高低电流级差 | 不同器件可能支持 normal/low-current |
| `VSYNC step` | SYNC 相对基线的抬升量 | 决定传感器能否可靠识别 | 边沿过快会增加 EMC，过慢可能检测失败 |
| `tBIT` | 单 bit 时间 | 用于划分半 bit 和中点 | 125 kbps 约 8 us，189 kbps 约 5.3 us |

### 3.2 为什么抗扰性较好

- 上行使用相对明显的电流调制，不是在高阻逻辑输入上区分很小的电压差。
- Manchester 每位中点必有跳变，接收器可以从边沿恢复时钟，并检查位时间和占空。
- 两线可使用双绞线，电流回路面积较小；专用收发器还可以做滤波、基线跟踪、限流和诊断。
- SYNC 的边沿可以在可靠识别与辐射发射之间折中。L9663 使用自动斜率控制，以更平滑的波形降低发射风险。

### 3.3 物理层不是“随便两根线”

线束电阻、总线电容、连接器接触电阻会改变同步边沿和调制电流的可见度。地偏移、短路到地或电池、反接与负载突变，需要由硬件保护和诊断处理。

多节点并联时，主收发器的电流范围和阈值算法必须覆盖所有节点静态电流的总和。任何物理层改动都应同时检查供电裕量、边沿、调制幅度和保护器件功耗。

## 4. Manchester 编码：先看中点跳变

PSI5 上行位流使用 Manchester 编码。每一个 bit 时间被分成前后两个 half-bit，中点必然发生一次跳变。本文采用常见约定：中点电流低 -> 高表示逻辑 0，中点高 -> 低表示逻辑 1。

![PSI5 Manchester 编码的中点跳变示意](/images/hardware/psi5-l9663-guide/manchester.svg)

*图 2：相邻同值 bit 可能在 bit 边界再出现一次跳变，但判决依据仍是中点方向。实际项目要以目标传感器和解码器的极性约定为准。*

### 4.1 波形判读步骤

1. 先从两个 start bit 建立 bit 周期 `tBIT`，并确认它们是固定的 `00`。
2. 按 `tBIT` 划分每一位，在每位 50% 附近寻找必然跳变。
3. 中点低 -> 高判为 0，中点高 -> 低判为 1，不要把 bit 边界跳变误当成中点。
4. 检查中点位置、半位宽、丢边沿和额外毛刺，再进行帧解析。

### 4.2 典型 Manchester 错误

| 现象 | 可能原因 | 优先检查 |
| --- | --- | --- |
| 某一位中点无跳变 | 电流幅度不足、滤波过强、瞬时掉电 | `dI`、阈值、线压 |
| 中点偏离 50% | 传感器时钟误差、边沿过慢、解码速率配错 | `tBIT`、边沿、baud 配置 |
| 出现额外短毛刺 | EMC 注入、探头接地、负载切换 | 原始电流波形和探测带宽 |
| 一串位整体反相 | 0/1 方向约定错误、测量极性相反 | 电流探头方向和 decoder 设置 |
| start bit 识别失败 | 帧起点错误、阈值跟踪未稳定、位速率不符 | 空闲基线、S1/S2、接收器配置 |

> 不要直接使用 UART 解码器。Manchester 不是 NRZ UART，UART 解析器会把半位跳变当作数据边沿，得到看似随机的字节。应使用 PSI5 专用解码、收发器数字输出，或按 `tBIT` 自行恢复。

## 5. 帧结构：Start + Data + Error Check

最常见的 PSI5 传感器上行帧由两个 start bit、数据区和错误检测位组成。start 固定为 `00`；数据按 `D0` 先发，即 LSB first；错误检测可使用 1 bit 偶校验或 CRC-3。

![PSI5 常见帧结构：start、数据区和校验字段](/images/hardware/psi5-l9663-guide/frame-structure.svg)

*图 3：帧的字段顺序只是协议层的外壳，数据区内部如何拆成 payload、status、frame control 或 messaging，仍要查目标传感器手册。*

### 5.1 帧长度与传输时间

如果数据区有 `k` bit：

- Parity 帧总长度：`p = k + 3`，其中 2 bit 来自 start，1 bit 来自 parity。
- CRC 帧总长度：`p = k + 5`，其中 2 bit 来自 start，3 bit 来自 CRC-3。
- 传输时间：`Tframe = p * tBIT`。

| 数据区 | 校验 | 总 bit 数 | 125 kbps | 189 kbps，约 5.3 us/bit |
| ---: | --- | ---: | ---: | ---: |
| 10 | Parity | 13 | 104 us | 约 68.9 us |
| 10 | CRC-3 | 15 | 120 us | 约 79.5 us |
| 16 | Parity | 19 | 152 us | 约 100.7 us |
| 16 | CRC-3 | 21 | 168 us | 约 111.3 us |
| 28 | CRC-3 | 33 | 264 us | 约 174.9 us |

### 5.2 v1.3 与 v2.x 数据区

v1.3 常见数据区长度由规范和器件模式限定；v2.x 可以在更宽的范围内组织数据，并拆成 Payload、Status、Frame Control 和 2-bit 慢速 Messaging 等字段。L9663 的接收能力可以覆盖 8 到 28 bit 数据区，但必须按目标传感器的实际帧定义解释这些 bit。

数据区不是天然的“一个有符号数”。例如一个 16-bit 数据区可能由 12-bit 传感器值、1-bit 状态和 3-bit 帧计数构成。只有读懂字段定义、缩放关系和错误码，才能把 raw frame 转成 g、kPa 或角度。

## 6. Parity 与 CRC-3：先统一位序

偶校验只保证数据区与校验位中 1 的总数为偶数；CRC-3 对突发错误更敏感。PSI5 传感器帧常用生成多项式：

$$
g(x) = x^3 + x + 1
$$

常见约定是 nondirect seed=`111`，数据按 LSB first 输入，两个 start bit 不参与计算。direct 与 nondirect 是等价实现，但初值、补零和循环形式必须成套，不能把 `111` 直接塞进另一种实现。

### 6.1 偶校验示例

```c
uint8_t psi5_even_parity(uint32_t data, uint8_t nbits)
{
    uint32_t mask = (nbits == 32U)
        ? 0xFFFFFFFFU
        : ((1UL << nbits) - 1U);

    return (uint8_t)(__builtin_popcount(data & mask) & 1U);
}
```

### 6.2 CRC-3 的 direct-form 示例

下面的实现使用与 nondirect seed=`111` 等价的 direct 初值 `010`，并在循环外不再补 3 个 0：

```c
uint8_t psi5_crc3_lsb(uint32_t data, uint8_t nbits)
{
    uint8_t crc = 0x2U;        /* direct equivalent of nondirect seed 111 */
    const uint8_t poly = 0x3U; /* x^3 + x + 1, omit x^3 term */

    for (uint8_t i = 0U; i < nbits; ++i) {
        uint8_t in = (uint8_t)((data >> i) & 1U); /* D0 first */
        uint8_t fb = (uint8_t)(((crc >> 2) & 1U) ^ in);

        crc = (uint8_t)((crc << 1) & 0x7U);
        if (fb != 0U) {
            crc ^= poly;
        }
    }

    return crc; /* transmit C2, C1, C0 */
}
```

可用公开向量做单元测试：

| 10-bit 数据 | 期望 CRC C2C1C0 | 十六进制结果 |
| ---: | ---: | ---: |
| `000h` | `110` | `6` |
| `0CCh` | `011` | `3` |
| `151h` | `000` | `0` |
| `1F4h` | `010` | `2` |
| `275h` | `111` | `7` |
| `3FFh` | `100` | `4` |

### 6.3 L9663 的双 CRC 陷阱

PSI5 传感器帧 CRC 是数据区 LSB first；L9663 的 32-bit SPI 通信虽然使用同一多项式族，但数据手册明确规定为 MSB first。两者输入位序不同，应建立两个独立、各自带测试向量的函数。

CRC 调试清单：

- 确认校验覆盖范围，通常覆盖完整数据区，不含两个 start bit。
- 确认输入顺序是 `D0 -> D[k-1]`，而不是按 MCU 内存中的字节 MSB first。
- 确认 CRC 发送顺序是 `C2 -> C1 -> C0`。
- 确认 direct 或 nondirect 算法、初值和补零方式成套。
- 至少用 `000h`、`151h`、`3FFh` 等公开向量做单元测试，再接真实波形。

## 7. 同步、时隙与总线拓扑

同步模式的关键不是“有一个 SYNC 就够了”，而是所有节点从同一个时间参考开始计时，每个响应都必须在约定的 slot 中开始和结束。规划错误会导致电流叠加、帧碰撞或接收缓冲映射错位。

![PSI5 同步周期与响应时隙](/images/hardware/psi5-l9663-guide/slot-timing.svg)

### 7.1 异步与同步

| 维度 | 异步 PSI5-A | 同步 PSI5-P/U/D/V |
| --- | --- | --- |
| 触发 | 传感器按内部周期发送 | ECU 发 SYNC 后传感器响应 |
| 多节点 | 通常更适合点对点 | 通过时隙承载多个响应 |
| 接收缓存 | 按到达顺序进入 FIFO | 按同步周期和 slot 映射 |
| 定位重点 | 帧间隔、FIFO 溢出 | SYNC、slot start/end、碰撞 |

### 7.2 常见拓扑

- `PSI5-A`：异步点对点，无周期 SYNC，由传感器自行发送。
- `PSI5-P`：同步并联，同一对线并联多个节点，靠时隙避免碰撞。
- `PSI5-U`：同步通用总线，供电和返回组织更灵活，依器件与子标准而定。
- `PSI5-D`：同步菊花链，逐级开关或寻址，便于位置识别。

器件支持项和连接方式必须同时匹配，不能只看到模式名称就假设拓扑一定成立。

### 7.3 模式名称怎么读

以 `PSI5-P10P-500/3L` 为例：

- `P`：同步并联模式；
- `10`：10-bit 数据区；
- `P`：1-bit parity；
- `500`：同步周期 500 us；
- `3`：3 个时隙；
- `L`：标准或低速率档，通常对应 125 kbps。

同理，`A10P-228/1L` 表示异步、10-bit、parity、约 228 us 周期和单响应组织；`P16CRC-500/2L` 表示同步并联、16-bit、CRC-3、500 us 周期和 2 个时隙。

这些名称描述的是一组通信参数，不是传感器型号。两个名字相近的器件，初始化流程和数据含义仍可能不同。

### 7.4 时隙规划公式

对第 `i` 个响应，至少需要满足：

$$
T_{start}(i+1) - T_{start}(i) > T_{frame}(i) + T_{guard}
$$

并且最后一个帧结束时间要早于下一次 SYNC 的保护窗口。其中：

- `Tframe = 总 bit 数 * tBIT`；
- `Tguard` 要覆盖传感器时钟容差、线束和滤波延迟、接收器去毛刺延迟，以及设计余量；
- `slot start` 是相对 SYNC 的响应起始时间，不要把它误当成 slot duration。

## 8. ECU -> 传感器：同步脉冲也能携带信息

PSI5 的主要业务通常是传感器上行，但部分版本和子标准支持 ECU 通过同步脉冲序列向传感器发送配置或编程信息。它不是像 UART 那样连续驱动 TX，而是把信息嵌在同步事件中。

### 8.1 Tooth-gap 方法

按固定同步节拍本应出现脉冲；出现脉冲和缺失脉冲分别表示不同 bit。L9663 的 upstream data buffer 可以按 bit 决定是否屏蔽某一次同步触发。

接收端必须区分“故意缺脉冲”和真正的同步丢失，所以命令格式、起始条件和 CRC 很重要。

### 8.2 Pulse-width 方法

每次仍然产生同步脉冲，但用标准短脉冲和长脉冲编码不同 bit。在 PSI5 2.x 模式中，L9663 可以按上行缓冲 bit 生成短或长同步脉冲。

同步电压幅值与脉宽必须同时满足目标传感器规范，否则可能既不能同步，也不能正确解码命令。

### 8.3 编程模式不是通用寄存器协议

具体命令帧、传感器地址、寄存器地址、OTP 写入、电压和时序限制、退出条件，通常由器件或子标准定义。不要只凭 `PSI5-P10P-500/3L` 这样的运行模式名称推断编程流程。

## 9. 初始化、慢速消息与数据语义

很多 PSI5 传感器上电后并不会立即输出稳定的业务数据，而会经过初始化阶段，发送器件标识、配置描述、状态或固定测试值。主节点需要区分初始化帧、正常数据帧、错误消息和编程响应。

从传感器手册提取参数时，建议至少建立下面这张表：

| 类别 | 必须记录的参数 |
| --- | --- |
| 供电与启动 | 工作电压、上电斜率、去耦、POR 时间、初始化阶段数量 |
| 运行模式 | A/P/U/D、同步周期、slot start、baud、数据位宽、Parity/CRC |
| 帧字段 | Payload、Status、Frame Control、Source ID、慢速消息位置 |
| 数据换算 | 量程、零点、灵敏度、二补码或偏置码、保留错误码 |
| 诊断 | 通信错误、传感器故障、温度或存储器错误、固定测试值 |
| 编程 | 地址、命令、CRC、解锁、OTP 电压、失败恢复 |

### 9.1 Messaging channel

PSI5 v2.x 数据区可以留出 2 bit messaging 字段，把较慢的信息分散在多个高速数据帧中。它适合传递标识、配置或诊断，不应与每帧实时 payload 混为一谈。

接收软件需要跨帧累积、检查帧计数并处理丢帧；单独看一帧，往往无法还原完整消息。

> AE 视角：客户说“raw data 不对”时，先确认截取的是哪个字段，是否把 Status 或 Frame Counter 当成数据，是否按 D0 first 重组，以及错误码是否与正常量程共用编码空间。

## 10. L9663：把协议落到一颗主收发器

L9663 是双通道汽车 PSI5 主收发器，连接 MCU 与两路 PSI5 传感器线，集成供电和预稳压相关控制、同步脉冲、限流保护、电流接收、Manchester 解码、时隙监控、缓冲、诊断和 32-bit SPI。

![L9663 Mode 1 和 Mode 2 的职责边界](/images/hardware/psi5-l9663-guide/l9663-architecture.svg)

### 10.1 Mode 1 与 Mode 2

| 项目 | Mode 1：L9663 解码 | Mode 2：外部 MCU 解码 |
| --- | --- | --- |
| MCU 接口 | 32-bit SPI 读缓冲与状态 | DOUT/SYNC 直接数字接口 |
| Manchester | L9663 解码并可检查错误 | MCU 的 PSI5 外设负责 |
| 时隙与缓冲 | L9663 可监控并保存多个帧 | 主要由 MCU 外设管理 |
| 适用场景 | 普通 MCU，降低软件实时性 | MCU 已集成 PSI5 控制器 |
| 主要风险 | 寄存器和 SPI CRC 配置复杂 | MCU 时序和解码能力要求高 |

### 10.2 L9663 接收链路

1. 镜像或采样传感器线电流，估计静态基线 `IBase`。
2. 用固定或动态阈值，把电流恢复为数字高低级。
3. 检测 `00` start bits，测量或验证 bit time，进行 Manchester 解码。
4. 按配置的数据长度和 Parity/CRC 收帧，并执行错误检查。
5. 同步模式按 slot 写入缓冲；异步模式使用 FIFO。
6. 通过 SPI 读取数据、错误码、基线或阈值信息和诊断状态。

### 10.3 需要留意的工程特性

根据本文的主资料，L9663 的典型工程关注点包括：

- 两个独立 PSI5 通道；每个同步周期可以配置多个接收帧；
- 支持 83.3、125 和 189 kbps，接收数据区覆盖 8 到 28 bit；
- SYNC 可以由 SPI、SYNCx 引脚或内部定时器触发；
- 上行数据缓冲支持 tooth-gap 或 pulse-width 的 ECU -> sensor 透明发送；
- 提供短地、反向电压、欠压、过压和同步幅值等诊断或保护能力。

配置原则是：先选系统架构（Mode 1 或 Mode 2），再固定传感器模式参数，最后填写 L9663 寄存器。不要从默认寄存器值倒推系统模式；上电时接口默认关闭，应在电源和时序正确后再启用通道。

## 11. MCU 固件架构：把实时接收与业务解耦

对 STM32 一类普通 MCU，推荐优先评估 L9663 Mode 1：由收发器完成电流判决、Manchester 和时隙映射，MCU 通过 SPI 批量读取。固件可以拆成下面几层：

| 层 | 职责 | 建议接口 |
| --- | --- | --- |
| `l9663_hal` | CS、SPI、RESET、SYNC、IRQ 和 32-bit 原始事务 | `read32` / `write32` / `trigger_sync` |
| `l9663_driver` | 寄存器、SPI CRC、状态和通道控制 | `init` / `config` / `read_status` / `read_slot` |
| `psi5_link` | bit 长度、Parity/CRC、slot、frame counter | `decode_frame` / `check_integrity` |
| `sensor_x` | 字段拆分、错误码、raw 到物理量 | `parse` / `convert` / `self_test` |
| `app` | 采样、日志、诊断和故障策略 | `task` / `event` / `telemetry` |

### 11.1 推荐初始化顺序

1. 保持 PSI5 通道关闭，建立 VB、VDD、VAS、VSYNC 所需的电源与外部器件。
2. 复位 L9663，读取状态或默认值，先证明 SPI 的 CPOL/CPHA、32-bit 帧和 SPI CRC 正确。
3. 写全局模式：Mode 1/2、PSI5 版本、baud、CRC 检查策略和同步编码方法。
4. 逐通道配置帧数、每帧数据长度、Parity/CRC、时隙起止和监控方式。
5. 配置同步源：SPI、SYNCx 或内部 timer；如果不用 ECU -> sensor 命令，先用标准短 SYNC。
6. 只启用一个通道、一个传感器和一个 slot，先收固定测试帧或已知静态值。
7. 确认稳定后，再增加第二传感器、更多时隙、诊断中断和业务功能。

### 11.2 运行时任务框架

```c
void PSI5_Task(void)
{
    if (l9663_irq_pending()) {
        l9663_status_t status = l9663_read_status();
        log_faults(status);

        for (uint8_t ch = 0U; ch < 2U; ++ch) {
            for (uint8_t slot = 0U;
                 slot < configured_slots[ch];
                 ++slot) {
                l9663_frame_t frame = l9663_read_slot(ch, slot);

                if (frame.valid && psi5_check_frame(&frame)) {
                    sensor_publish(ch, slot, sensor_parse(&frame));
                } else {
                    psi5_record_error(ch, slot, frame.error);
                }
            }
        }
    }
}
```

业务层不要只保存换算后的 `float`。至少保留 timestamp、channel、slot、raw data、frame length、CRC/parity result、Manchester/slot error 和 L9663 status。没有这些字段，EMC 或偶发故障很难复盘。

## 12. 示波器与逻辑分析仪：一层一层抓证据

PSI5 调试最怕“只看 SPI 打印值”。正确方法是建立从模拟线到数字帧的证据链：供电 -> 同步 -> 电流调制 -> Manchester -> 帧和时隙 -> SPI 与软件。

![PSI5 六层调试证据链](/images/hardware/psi5-l9663-guide/debug-chain.svg)

### 12.1 建议仪器连接

| 信号 | 工具 | 目的 | 注意 |
| --- | --- | --- | --- |
| `VPSI` 对回线 | 差分探头或隔离示波器 | 看直流供电、SYNC 幅值、宽度和边沿 | 不要用长地线跨接高噪声回路 |
| 线路电流 | 电流探头优先 | 看 `Iq`、`dI` 和 Manchester | 确认探头方向与带宽 |
| 小分流电阻 | 差分探头测压降 | 无电流探头时替代 | 阻值尽量小，检查压降与功耗 |
| `DOUT1/2` | 逻辑分析仪或示波器 | 看恢复后的 Manchester 位流 | Mode 2 或直接接口时更有用 |
| `SYNC1/2` | 逻辑分析仪 | 对齐 MCU 触发与线端实际 SYNC | 注意传播与滤波延迟 |
| SPI | 逻辑分析仪 | 验证 32-bit 事务、地址、CRC 和读回 | 确认模式与 CS 边界 |

### 12.2 第一轮 bring-up 只做五件事

1. 断电测阻，确认 PSI5 线无短路；限流上电，确认静态电流合理。
2. 只启用一个通道和一个传感器，测稳定的 `VPSI` 与 `Iq`。
3. 触发一个标准短 SYNC，测线端实际幅值、宽度、上升沿和下降沿。
4. 在预期 slot 内寻找 `dI`，并测得 `tBIT`。
5. 同时读取 L9663 buffer/status，把模拟波形与数字结果一一对应。

### 12.3 一张波形怎么读

- 先定 `t=0`：使用线端 SYNC 的有效检测参考，而不是只看 MCU GPIO 边沿。
- 量 `Tstart`：SYNC 到第一个 start bit 的时间，确认响应落入目标 slot。
- 量 `tBIT`：由 start bit 和数据中点间隔判断 125、189 或 83.3 kbps。
- 量 `dI`：确认高低电流级差是否覆盖接收阈值和噪声裕量。
- 按中点方向恢复 S1/S2、D0...、P/CRC，并与 SPI 数据逐位比对。

## 13. 常见故障树：从现象回到层级

| 现象 | 最可能层级 | 首要检查 | 次要检查 |
| --- | --- | --- | --- |
| 完全无电流 | 供电或开关 | 通道是否启用、VAS、PSIx | 线束开路、传感器反接 |
| 电流过大或限流 | 短路或负载 | PSIx 短地、传感器损坏 | 节点数、上电浪涌、去耦 |
| 有 SYNC 无响应 | 传感器模式或时隙 | SYNC 幅值、宽度、目标模式 | slot start、传感器启动阶段 |
| 有 `dI` 但无有效帧 | 阈值或 Manchester | `dI`、baud、start bits | 滤波、边沿、阈值跟踪 |
| 偶发 Manchester error | 物理层或 EMC | 毛刺、地偏移、线容 | bit-time 窗口、deglitch |
| Parity/CRC error | 位序或丢位 | 覆盖范围、D0 first、帧长度 | 物理毛刺、错误起点 |
| slot error | 时间规划 | frame start/end、guard | SYNC 延迟、时钟容差 |
| SPI 数据不变 | MCU/L9663 接口 | CS、CPOL/CPHA、地址 | buffer empty、读时序、SPI CRC |
| 第二节点加入后失败 | 总线负载或碰撞 | `Iq` 总和、时隙重叠 | 线容、阈值、供电压降 |

### 13.1 高效排查顺序

1. 把系统退回 1 通道 + 1 传感器 + 1 slot + 固定短 SYNC。
2. 保存正常波形基线：`VPSI`、`Iq`、SYNC、`dI`、DOUT、SPI。
3. 根据故障现象只修改一项：电源、模式、baud、slot 或阈值。
4. 对每次修改记录寄存器 diff 与波形 diff，不凭打印值猜测。
5. 恢复多节点时逐个增加，观察 `Iq`、线容与响应时隙如何变化。

EMC 测试时应按层计数：电源或欠压、同步、Manchester、CRC、slot、SPI。若只统计“数据越界”，无法区分传感器真实测量异常与通信链路受扰。

## 14. 完整例子：P10P-500/3L 三传感器系统

假设 3 个传感器并联在一个 PSI5 通道，模式为 `P10P-500/3L`：10-bit 数据、偶校验、500 us 同步周期、3 个时隙、125 kbps。

### 14.1 先算帧占用

- 总 bit 数 = 2 start + 10 data + 1 parity = 13 bit；
- 125 kbps -> `tBIT = 8 us`；
- `Tframe = 13 * 8 us = 104 us`。

### 14.2 规划时隙

下面只是工程示例，不是标准固定值：

| 响应 | 起始时间 | 预计结束 | 与下一响应间隔 |
| --- | ---: | ---: | --- |
| Sensor 1 | 40 us | 144 us | 36 us guard |
| Sensor 2 | 180 us | 284 us | 36 us guard |
| Sensor 3 | 320 us | 424 us | 到下次 SYNC 约 76 us |

### 14.3 抓到一帧后

1. 确认 start=`00`；若不是，先怀疑帧起点或 Manchester 极性。
2. 按 `D0 -> D9` 重组 10-bit raw：

   $$
   raw = \sum_{i=0}^{9} D_i \cdot 2^i
   $$

3. 计算 even parity，与尾部 P 比较。
4. 根据传感器手册判断 raw 是二补码、偏置码、正常值还是保留错误码。
5. 用 slot 与传感器物理位置映射，不要只用“帧到达次序”永久绑定。

> 为什么需要 guard：104 us 只是理想传输时间。真实系统还有传感器响应容差、振荡器误差、线端检测延迟、接收滤波和同步参考偏差。若三个 104 us 帧无间隙地塞进 500 us，EMC 或温漂下很容易跨 slot。

## 15. 与 TDM / A2B 对照理解

| 维度 | PSI5 | TDM / SAI | A2B |
| --- | --- | --- | --- |
| 主要用途 | 汽车远端传感器 | 板内或短距同步数字音频 | 车载多节点音频网络 |
| 数据线形态 | 两线供电复用 | BCLK/FS/SD 等独立数字线 | 差分菊花链 |
| 时钟来源 | Manchester 自时钟 + SYNC 周期 | 显式 BCLK/FS | 链路时钟与超帧 |
| 上行信号 | 电流调制短帧 | 逻辑电平 bitstream | 高速差分双向 |
| 多节点方式 | slot、并联或菊花链 | 通常多个 slot | 链路节点与通道映射 |
| 调试首要波形 | VPSI、Iline、SYNC、DOUT | BCLK、FS、SD | A2B 差分、节点状态、TDM 口 |

PSI5 slot 与 TDM slot 都用于时间复用，但 PSI5 的 slot 是“SYNC 后的响应时间窗口或起始时间”，不是由连续 BCLK/FS 切出的固定 bit 槽。PSI5 帧自身仍需通过 Manchester 恢复 bit timing。

## 16. 设计与评审清单

### 16.1 原理图与硬件

- 主收发器的 VB、VDD、VAS、VASSUP、VSYNC/Bootstrap 外围是否按目标供电架构连接。
- PSIx 通道保护、限流、TVS、反接与故障能量是否满足整车和实验室条件。
- 传感器线回路与地设计是否清晰；连接器、线束、节点数与总电流是否已纳入预算。
- 是否预留 VPSI 差分测点、低阻电流测点、SYNC、DOUT、SPI 和 IRQ 测点。
- Mode 1/2 的数字引脚与 MCU 外设是否匹配；电平是否由 VDD 正确设定。

### 16.2 协议参数表

- PSI5 版本或子标准、A/P/U/D/V 模式和拓扑。
- 同步周期、SYNC 幅值和宽度、ECU -> sensor 编码方法。
- 每个传感器或 Source ID 的 slot start、帧长度、baud、Parity/CRC。
- Payload、Status、Frame Control、Messaging 字段和 raw 换算。
- 初始化阶段、错误码、编程模式和安全限制。

### 16.3 固件与测试

- SPI CRC 与 PSI5 frame CRC 分离，并各有公开测试向量。
- 所有寄存器写入都有读回或状态确认；配置表可以导出并版本化。
- 日志保存 raw frame、timestamp、channel、slot、错误位和寄存器快照。
- 具备单通道单节点降级模式、固定测试帧模式和故障注入入口。
- 已建立正常温度、电压和线长下的黄金波形，EMC 结果可以与之比较。

## 17. 自测与实操任务

### 17.1 概念自测

1. 为什么只测 `VPSI` 电压可能看不到清晰的传感器上行数据？
2. Manchester 的 bit 边界跳变和中点跳变，哪个是必然的？判 0/1 看什么？
3. `P16CRC-500/2L` 中每段代表什么？125 kbps 时一帧占多少时间？
4. 为什么传感器 frame CRC 与 L9663 SPI CRC 不应共用同一个函数？
5. 同步系统加入第二个传感器后 CRC 错误变多，哪些物理层与时隙因素会变化？

### 17.2 建议实操

1. 用公开 CRC 向量写单元测试：`000h -> 6`、`151h -> 0`、`3FFh -> 4`。
2. 在纸上画出 10-bit parity 帧的数据位序，并从一个十六进制 raw 写出发送顺序。
3. 用示波器同时抓 SYNC 与分流电阻压降，测 `Tstart`、`tBIT`、`dI`。
4. 把同一帧从模拟电流、DOUT 位流、L9663 SPI buffer 三处逐位对应。
5. 故意配置错误 baud 或 slot，记录 L9663 的 Manchester、slot、CRC 错误表现。

真正掌握的标志是：即使没有协议解码器，也能从 SYNC 与电流波形手动恢复一帧；能说明每个 bit 的意义；能把 L9663 状态与波形对应；能判断问题属于供电、物理层、Manchester、时隙、校验还是应用数据语义。

## 18. 术语速查

| 术语 | 含义 |
| --- | --- |
| ECU / Master / Leader | 主节点，给传感器供电、产生同步并接收数据 |
| Satellite / Slave / Follower | 远端传感器节点 |
| SYNC | 主节点抬高线电压形成的同步或命令脉冲 |
| `Iq / IBase` | 传感器总线静态取电电流基线 |
| `IMOD / dI` | 传感器发送数据时叠加的调制电流 |
| Manchester | 每位中点必跳变的双相编码 |
| S1 / S2 | 固定为 `00` 的两个 start bit |
| Parity | 使数据与校验位中 1 的总数为偶数 |
| CRC-3 | 3-bit 循环冗余校验，常用 `g(x)=x^3+x+1` |
| Time slot | SYNC 之后为某个响应预留的时间窗口或起始时间 |
| `TSYNC` | 相邻同步事件之间的周期 |
| Tooth gap | 通过缺失或屏蔽同步脉冲编码 ECU -> sensor 信息 |
| Pulse width | 通过短或长同步脉冲编码 ECU -> sensor 信息 |
| DOUT | 主收发器恢复出的数字接收信号 |
| UDB | L9663 upstream data buffer，用于发送同步序列信息 |

## 19. 资料来源与继续阅读

1. STMicroelectronics, *L9663 Automotive PSI5 Transceiver IC*, DS11401 Rev 7, 2025-10。本文关于 L9663 架构、模式、同步、buffer、SPI 与诊断的内容以该资料为主。
2. STMicroelectronics, [L9663 operation in PSI5-P operation mode, AN5366](https://www.st.com/resource/en/application_note/an5366-l9663-operation-in-psi5p-operation-mode-stmicroelectronics.pdf)。
3. NXP Semiconductors, [FXPS71407S Data Sheet](https://www.nxp.com/docs/en/data-sheet/FXPS71407S.pdf)，其中包含 PSI5 物理层、Manchester、帧和 CRC 示例。
4. NXP Semiconductors, [PSI5 Normal Mode Initialization and Main Features for the FXLS93xxx, AN12776](https://www.nxp.com/docs/en/application-note/AN12776.pdf)。
5. Infineon Technologies, *AURIX Peripheral Sensor Interface Training*。
6. PSI5 Consortium official site: [psi5.org](https://psi5.org/)。

落板前的最后一步，是用目标传感器 datasheet 补齐一张“协议参数表”：供电、同步、拓扑、baud、数据位宽、校验、slot、初始化、数据换算和诊断字段都应有明确出处。
