---
layout: doc
title: A2B 主机板设计复盘：TDM 长线、EMC 定位与传感器接入
description: 结合 A2B 主机板投板工程，梳理 TDM、A2B、较长线缆、EMC/RI 定位和远端传感器接入的系统设计逻辑。
tags:
  - A2B
  - A2B 收发器
  - TDM
  - EMC
  - 硬件项目
---

# A2B 主机板设计复盘：TDM 长线、EMC 定位与传感器接入

> 简介：结合 A2B 主机板投板工程，梳理 TDM、A2B、较长线缆、EMC/RI 定位和远端传感器接入的系统设计逻辑。





## 1. 这次项目真正要解决的问题

这轮设计一开始容易混在一起的概念有几个：

```text
TDM 是什么？
TDM 有没有“协议帧”？
TDM 能不能直接拉 较长线缆？
EMC/RI 扫频时，异常到底来自 传感器，还是来自通讯线？
A2B 能不能替代裸 TDM？
A2B 主节点 node 和 subordinate node 的 BCLK/SYNC/DTX/DRX 应该怎么接？
```

最终收敛出的主线是：

> **不要让较长线缆承载裸 TDM。让 较长线缆承载 A2B 差分总线；TDM 只保留在 传感器-A2B 和 A2B-MCU 的短距离本地连接里。**

这不是单纯“换一颗芯片”，而是系统架构从“裸同步数字线长距离传输”改成“本地 TDM + 远距离差分总线”的问题。

## 2. TDM 不是 UART 那种完整通信协议

TDM 是 **Time Division Multiplexing，时分复用**。更准确地说，它是一种同步串行数据帧格式，而不是带地址、ACK、重传、CRC 的完整通信协议。

它的核心思想是：

```text
一根 DATA 线上，按照时间 slot 依次传多个通道的数据。
```

例如 2 通道、每通道 32 bit：

```text
| CH0 32 bit | CH1 32 bit |
```

如果采样率为 Fs、slot 数为 N、每个 slot 为 W bit，则：

```text
BCLK = Fs × N × W
```

这类接口的关键参数不是“帧头/命令/CRC”，而是：

```text
1. 采样率 / SYNC 频率
2. 每帧 slot 数量
3. 每个 slot 的 bit 数
4. data width
5. MSB first / LSB first
6. SYNC 极性和宽度
7. BCLK 采样边沿
8. 数据相对 SYNC 是否有一 bit delay
```

所以 TDM 的“帧”只是一个周期性采样帧：

```text
SYNC 周期 = 一帧
一帧里面分多个 slot
每个 slot 对应一个通道数据
```

它不是这种帧：

```text
AA 55 Len Cmd Payload CRC 0D 0A
```

因此，一旦裸 TDM 链路发生 bit error、slot 错位或 SYNC 误判，链路自身并不会像有 CRC/ACK 的协议那样主动发现并重传。

## 3. 裸 TDM 为什么不适合直接拉 较长线缆

裸 TDM 通常包含：

```text
BCLK / SCK     位时钟
SYNC / FS      帧同步
DATA           串行数据
MCLK           可选主时钟
GND            回流地
```

在传感器场景里，大概是：

```text
BCLK  -> 传感器
SYNC  -> 传感器
DTX0  <- 传感器
DTX1  <- 传感器
```

问题在于，裸 TDM 依赖 CMOS 电平边沿。线缆变长后，BCLK/SYNC/DATA 都会暴露在线束环境里，带来：

```text
反射
过冲 / 下冲
串扰
共模干扰
地弹
线束天线效应
RF 注入
时钟边沿抖动
帧同步误判
数据 bit 翻转
```

因此，标准或客户要求用 较长线缆束做 RI/扫频测试，并不等于裸 TDM 是合理的产品通信方案。

更准确的判断是：

```text
从标准/客户规范复现角度：
较长线缆束测试可能是合理的。

从接口可靠性角度：
直接用裸 TDM 拉 较长线缆，不是稳妥设计。
```

## 4. A2B 在这个系统里的价值

A2B 是 **Automotive Audio Bus**，ADI 的车载音频总线。它的作用是：

> **把多通道 I2S/TDM、同步时钟和控制信息封装到一对差分双绞线上，实现远距离传输。**

可以这样记：

```text
TDM 是本地数据格式；
A2B 是远距离差分运输通道。
```

原来的风险结构是：

```text
传感器 <- 较长线缆上的裸 TDM 线 ->  MCU
```

改成 A2B 后，系统应该变成：

```text
传感器
  |
  | 短距离 TDM / I2C
  |
A2B 从节点
  |
  | A2B 单对差分线，较长线缆 或更长
  |
A2B 主节点
  |
  | 短距离 TDM / I2C
  |
STM32 / MCU
```

关键点是：

> **A2B 从节点 要尽量靠近 传感器，让传感器到 A2B 的 TDM 是短距离；长距离只走 A2B 差分线。**

如果把 A2B 芯片放在 MCU 端，而传感器到 A2B 仍然走 较长线缆上的裸 TDM，那没有解决根问题。

## 5. A2B 主节点/subordinate 的方向关系

A2B 至少需要两颗 transceiver：

```text
MCU 端：A2B 主节点 node
传感器端：A2B 从节点 node
```

这类 A2B 收发器适合这个场景，是因为它支持 main node 和 I2S/TDM；不能把其他同系列器件简单当成同等替代。

| 型号 | main node capable | I2S/TDM support | 适合 TDM 传感器场景 |
| --- | ---: | ---: | --- |
| 其他同系列器件 | No | No | 不适合 |
| 其他同系列器件 | No | No | 不适合 |
| A2B 收发器 | Yes | Yes | 适合 |

main/subordinate 的 BCLK/SYNC 方向很容易接错：

### MCU 端 A2B 主节点

```text
STM32 SAI_BCLK  -> A2B 主节点 BCLK
STM32 SAI_SYNC  -> A2B 主节点 SYNC
A2B 主节点 DTX -> STM32 SAI_RX
STM32 SAI_TX    -> A2B 主节点 DRX，按下行需求决定是否使用
```

也就是：主控 STM32 提供 TDM 时钟和帧同步。

### 传感器端 A2B 从节点

```text
A2B 从节点 BCLK -> 传感器 BCLK
A2B 从节点 SYNC -> 传感器 SYNC
传感器 DTX0/DTX1        -> A2B 从节点 DRX0/DRX1
```

也就是：subordinate 从 A2B 总线恢复时钟，然后在本地输出 BCLK/SYNC 给 传感器。

传感器数据方向是：

```text
传感器
  ↓
A2B 从节点
  ↓ upstream slots
A2B 主节点
  ↓
STM32 SAI 接收
```

所以这个系统主要关注 **upstream slot** 配置。

## 6. 本次 A2B 主机板设计状态

本节只保留可迁移的设计结论，不公开本地工程路径、原始文件名、网表编号或板卡连接器编号。

当前主机板已完成投板前 review，核心链路具备首板验证基础。bring-up 前仍应重点确认：

- 电源、跳线和终端配置是否与当前装配版本一致；
- 替代器件、去耦参数和未装配项是否完成评审；
- DRC、丝印和线束接口是否已按最终版本复核；
- 所有测量结论是否与实际装配版本一一对应。

## 7. 主机板网表中的关键连接证据

从原理图与网表可以抽象出几条关键链路：

### 7.1 控制接口

主控通过短距离控制总线配置 A2B 主节点；如果需要访问远端节点，则由 A2B 链路转发到远端接口。远端传感器的控制线不应直接跨越较长线缆。

### 7.2 主机侧 TDM/SAI

| 链路 | 抽象连接 | 结论 |
| --- | --- | --- |
| 主控时钟 | MCU SAI 时钟 -> A2B 主节点时钟输入 | 保持短距离并控制边沿 |
| 帧同步 | MCU SAI 同步 -> A2B 主节点同步输入 | 明确极性和时序 |
| 上行数据 | A2B 主节点数据输出 -> MCU SAI 接收 | 核对 slot 映射和 DMA |
| 下行数据 | MCU SAI 发送 -> A2B 主节点数据输入 | 按系统是否需要下行功能决定 |

### 7.3 A2B 差分总线接口

A2B 差分口应经过匹配、共模抑制和隔离变压器后连接线束。不同端口的正负极性、跳线默认状态和线束定义必须在接口文档中统一，避免只依赖原理图记忆。

### 7.4 电源与调试点

电源、内部稳压输出、IO 电平、地焊盘和 IRQ 等信号应分别设置可观测点。实际 bring-up 时优先验证限流上电、内部电源时序、控制接口应答和错误状态，再连接远端节点。

## 8. EMC/RI 定位不能只看最终数据异常

RI 扫频时如果数据异常，不能直接下结论说 传感器坏了或协议错了。异常可能来自：

```text
1. BCLK 被干扰
2. SYNC 被干扰
3. DATA 被干扰
4. 传感器电源被干扰
5. 传感器模拟前端被干扰
6. 传感器数字内核异常
7. MCU SAI 接收异常
8. DMA overrun / frame error
9. 地回路共模电流
```

所以应该做对照实验矩阵。

## 9. 最关键的定位方法：假 TDM pattern

不要一开始就拿真实传感器做完整 RI 扫频。推荐先在 传感器端用一个可控源输出固定 TDM pattern：

```text
CH0 = 固定交替 pattern
CH1 = 另一组交替 pattern
CH2 = 递增 frame counter
CH3 = 取反 frame counter
```

MCU 端检查：

```text
pattern 是否正确
frame_counter 是否连续
slot 是否错位
bit order 是否正确
有没有 bit error
有没有 SAI/DMA error
```

判断逻辑：

| 测试结果 | 优先怀疑 |
| --- | --- |
| 假 TDM pattern 都错 | 线缆、BCLK、SYNC、DATA、接收裕量、地回路 |
| 假 TDM pattern 正常，真实传感器 错 | 传感器本体、电源、模拟前端、寄存器状态 |
| frame counter 不连续 | 帧丢失、接收错位、DMA/SAI 异常 |
| slot 位置错 | TDM 配置、SYNC 极性、slot offset |
| 数据物理量漂移但帧完整 | 传感器本体或模拟链路受扰 |

更像 TDM 链路被干扰的现象：

```text
突然错位
CH0/CH1 串位
frame counter 跳变
固定 pattern 出现 bit error
SAI/DMA 报错
改变线缆摆放后失败频点变化
加串阻/屏蔽/双绞后改善明显
```

更像 传感器本体异常的现象：

```text
TDM 帧结构完整
frame counter 连续
SAI/DMA 无错误
数据噪声变大、偏置漂移、饱和、卡死
传感器状态寄存器异常
传感器电源/参考电压有纹波或跌落
短线时同样频点也异常
```

## 10. 如果被迫裸 TDM 长线，最低限度怎么做

如果标准或临时验证强制要求裸 TDM 拉 较长线缆，至少不要散线乱飞。

推荐：

```text
BCLK-GND 一对
SYNC-GND 一对
DATA0-GND 一对
DATA1-GND 一对
MCLK-GND 一对，如果有 MCLK
VDD-GND 一对
```

不推荐：

```text
BCLK / SYNC / DATA0 / DATA1 / VDD / GND 一排散线直接拉 较长线缆
```

串联电阻建议预留：

```text
BCLK：驱动端串 按信号完整性实测预留可调范围
SYNC：驱动端串 按信号完整性实测预留可调范围
MCLK：驱动端串 按信号完整性实测预留可调范围
DATA：传感器端串 按信号完整性实测预留可调范围
```

这些电阻主要用于：

```text
减缓边沿
减小振铃
降低过冲/下冲
改善 EMI
提高接收边沿裕量
```

最终值必须靠示波器实测，不建议无脑固定 100 Ω。

## 11. A2B 主机板首板 bring-up 路线

### Step 1：先跑通 A2B 主节点 本体

先不接远端节点。

检查：

```text
限流上电
VIN 是否在目标范围
VOUT1 是否约 1.9 V
VOUT2/IOVDD 是否约 3.3 V
I2C 是否能读 A2B 主节点 ID
IRQ/状态寄存器是否正常
```

### Step 2：两个 A2B 节点 跑通 A2B link

目标：

```text
STM32 能配置 A2B 主节点
main 能发现 subordinate
能读 subordinate ID/status
A2B link 稳定
```

这一步只证明 A2B 基础链路正常，还不急着证明 传感器数据。

### Step 3：确认远端 BCLK/SYNC

A2B link 建立后，在 传感器端 A2B 从节点 测：

```text
BCLK
SYNC
```

确认：

```text
BCLK 是否为目标频率，目标 BCLK 频率
SYNC 是否为目标采样率，目标 SYNC 频率
SYNC 极性是否匹配 传感器
帧同步宽度是否匹配 传感器
BCLK 边沿是否干净
```

### Step 4：先用假 TDM pattern

先验证：

```text
slot 是否对齐
bit order 是否正确
是否有一 bit delay
upstream slot 映射是否正确
DMA 接收是否稳定
```

### Step 5：再接真实传感器

确认：

```text
远端传感器 I2C 是否能配置
传感器是否根据 BCLK/SYNC 正常输出 TDM
DTX0/DTX1 数据 slot 含义是否正确
X/Y/Z/status 是否对应正确
状态位是否正常
量程/单位是否正确
```

### Step 6：最后做 EMC/RI

推荐顺序：

```text
无 RF baseline
短线真实传感器
A2B 长线假 pattern
A2B 长线真实传感器
失败频点定频驻留
完整扫频
```

每次只改一个变量，避免最后只能猜。

## 12. 设计检查清单

### 架构检查

```text
[ ] MCU 端是否是 A2B 主节点？
[ ] 传感器端是否是 A2B 从节点？
[ ] 传感器和 subordinate 是否靠近，TDM 是否保持短距离？
[ ] 长距离是否只走 A2B AP/AN 或 BP/BN 差分线？
[ ] 是否避免 较长线缆 裸 BCLK/SYNC/DATA？
```

### 电平检查

```text
[ ] A2B 节点 IOVDD 是否匹配系统 IO 电平？
[ ] 传感器 I2C IO 电平是否匹配？
[ ] 传感器 TDM IO 电平是否匹配？
[ ] I2C 上拉电压是否正确？
[ ] 是否需要电平转换？
```

### TDM 检查

```text
[ ] BCLK 频率是否正确？
[ ] SYNC 频率是否正确？
[ ] SYNC 极性是否正确？
[ ] slot 数量是否正确？
[ ] slot size 是否正确？
[ ] data width 是否正确？
[ ] bit order 是否正确？
[ ] DTX0/DTX1 到 DRX0/DRX1 是否对应正确？
[ ] MCU SAI slot active 配置是否对应？
```

### A2B bus 检查

```text
[ ] AP/AN/BP/BN 方向是否正确？
[ ] 线束正负是否和 JP3/JP5 丝印一致？
[ ] 差分线缆阻抗是否满足系统目标？
[ ] 是否有共模电感？
[ ] 是否有 ESD/TVS？
[ ] connector pinout 是否避免差分对交叉？
[ ] 是否预留 EMC 调试器件？
```

### 调试检查

```text
[ ] 能读 A2B 主节点 ID？
[ ] 能发现 subordinate？
[ ] 能读 subordinate ID/status？
[ ] 传感器端 BCLK/SYNC 是否输出？
[ ] 假 TDM pattern 是否能无误传输？
[ ] 真实传感器 I2C 是否能配置？
[ ] 真实传感器 TDM 数据是否 slot 对齐？
[ ] RI 失败时是否记录 frame counter / SAI error / 传感器 status？
```

## 13. 总结

这次从裸 TDM 拉 较长线缆 切到 A2B 的方向是成立的。真正要记住的是：

```text
1. TDM 不是完整通信协议，而是同步串行多通道数据帧格式。
2. 裸 TDM 适合板级/短距离，不适合承担 较长线缆通信。
3. 标准要求 较长线缆束做 RI/扫频，不代表裸 TDM 是合理产品方案。
4. A2B 的作用是把本地 I2S/TDM、同步、控制信息封装到单对差分线上。
5. TDM 传感器 场景优先用 A2B 收发器，不能把其他同系列器件 混用理解。
6. MCU 端 A2B 主节点是 main，传感器端 A2B 从节点是 subordinate。
7. main 端 BCLK/SYNC 由 STM32 提供给 A2B 收发器；subordinate 端 BCLK/SYNC 由 A2B 从节点输出给 传感器。
8. 传感器数据从 subordinate 回到 main，属于 upstream slots。
9. 首板验证顺序：A2B link -> BCLK/SYNC -> 假 pattern -> 真实传感器 -> EMC。
```

项目工程上的一句话判断：

> **A2B 主机板的核心通信链路、电源主路径、I2C/TDM 关键连接已经具备首板验证基础；后续重点从“接线是否正确”转向“配置、诊断和 EMC 定位是否可控”。**
