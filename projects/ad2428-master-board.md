---
layout: doc
title: AD2428 A2B 主机板设计复盘：TDM 长线、EMC 定位与 Sensor 接入
description: 结合 AD2428 主机板投板工程，梳理 TDM、A2B、1.8 m 线缆、EMC/RI 定位和远端 sensor 接入的系统设计逻辑。
tags:
  - A2B
  - AD2428
  - TDM
  - EMC
  - 硬件项目
---

# AD2428 A2B 主机板设计复盘：TDM 长线、EMC 定位与 Sensor 接入

> 简介：结合 AD2428 主机板投板工程，梳理 TDM、A2B、1.8 m 线缆、EMC/RI 定位和远端 sensor 接入的系统设计逻辑。

![AD2428 主机板原理图预览](/images/projects/ad2428-master-board/schematic-preview.png)

*图注：从 Altium 工程预览中提取的 AD2428 主机板原理图总览，用于记录本次主机板设计状态。*

## 1. 这次项目真正要解决的问题

这轮设计一开始容易混在一起的概念有几个：

```text
TDM 是什么？
TDM 有没有“协议帧”？
TDM 能不能直接拉 1.8 m 线？
EMC/RI 扫频时，异常到底来自 sensor，还是来自通讯线？
A2B 能不能替代裸 TDM？
AD2428 main node 和 subordinate node 的 BCLK/SYNC/DTX/DRX 应该怎么接？
```

最终收敛出的主线是：

> **不要让 1.8 m 线缆承载裸 TDM。让 1.8 m 线缆承载 A2B 差分总线；TDM 只保留在 sensor-A2B 和 A2B-MCU 的短距离本地连接里。**

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

如果采样率是 48 kHz，slot 数为 2，每个 slot 为 32 bit，则：

```text
BCLK = 48 kHz × 2 × 32 = 3.072 MHz
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

## 3. 裸 TDM 为什么不适合直接拉 1.8 m

裸 TDM 通常包含：

```text
BCLK / SCK     位时钟
SYNC / FS      帧同步
DATA           串行数据
MCLK           可选主时钟
GND            回流地
```

在 sensor 场景里，大概是：

```text
BCLK  -> sensor
SYNC  -> sensor
DTX0  <- sensor
DTX1  <- sensor
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

因此，标准或客户要求用 1.8 m 线束做 RI/扫频测试，并不等于裸 TDM 是合理的产品通信方案。

更准确的判断是：

```text
从标准/客户规范复现角度：
1.8 m 线束测试可能是合理的。

从接口可靠性角度：
直接用裸 TDM 拉 1.8 m，不是稳妥设计。
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
sensor  <- 1.8 m 裸 TDM 线 ->  MCU
```

改成 A2B 后，系统应该变成：

```text
sensor
  |
  | 短距离 TDM / I2C
  |
AD2428 subordinate
  |
  | A2B 单对差分线，1.8 m 或更长
  |
AD2428 main
  |
  | 短距离 TDM / I2C
  |
STM32 / MCU
```

关键点是：

> **AD2428 subordinate 要尽量靠近 sensor，让 sensor 到 A2B 的 TDM 是短距离；长距离只走 A2B 差分线。**

如果把 A2B 芯片放在 MCU 端，而 sensor 到 A2B 仍然走 1.8 m 裸 TDM，那没有解决根问题。

## 5. AD2428 main/subordinate 的方向关系

A2B 至少需要两颗 transceiver：

```text
MCU 端：AD2428 main node
sensor 端：AD2428 subordinate node
```

AD2428 适合这个场景，是因为它支持 main node 和 I2S/TDM；不能把 AD2426/AD2427 简单当成同等替代。

| 型号 | main node capable | I2S/TDM support | 适合 TDM sensor 场景 |
| --- | ---: | ---: | --- |
| AD2426 | No | No | 不适合 |
| AD2427 | No | No | 不适合 |
| AD2428 | Yes | Yes | 适合 |

main/subordinate 的 BCLK/SYNC 方向很容易接错：

### MCU 端 AD2428 main

```text
STM32 SAI_BCLK  -> AD2428 main BCLK
STM32 SAI_SYNC  -> AD2428 main SYNC
AD2428 main DTX -> STM32 SAI_RX
STM32 SAI_TX    -> AD2428 main DRX，按下行需求决定是否使用
```

也就是：主控 STM32 提供 TDM 时钟和帧同步。

### sensor 端 AD2428 subordinate

```text
AD2428 subordinate BCLK -> sensor BCLK
AD2428 subordinate SYNC -> sensor SYNC
sensor DTX0/DTX1        -> AD2428 subordinate DRX0/DRX1
```

也就是：subordinate 从 A2B 总线恢复时钟，然后在本地输出 BCLK/SYNC 给 sensor。

sensor 数据方向是：

```text
sensor
  ↓
AD2428 subordinate
  ↓ upstream slots
AD2428 main
  ↓
STM32 SAI 接收
```

所以这个系统主要关注 **upstream slot** 配置。

## 6. 本次 AD2428 主机板设计状态

本项目路径：

```text
D:\AD_Project\AD2428MasterBoard_Project
```

本篇主要结合以下文件整理：

```text
D__AD_Project_AD2428MasterBoard_Project_Sheet6.NET
A2B_主机PCB最终Review_2026-07-01_v4.md
A2B_主机官方EVA第2页对比Review_2026-07-02_Sheet6.md
Sheet1.pdf
__Previews/Sheet1.SchDocPreview
```

当前主机板已经完成投板相关 review，核心链路具备首板验证基础。Sheet6 相比上一轮已经修正了几个关键参数：

| 项目 | 修正后状态 | 说明 |
| --- | --- | --- |
| `C13` | `3.3nF` | 对应官方 `3300pF` |
| `R8` | `1Ω` | 修正上一版阻值差异 |
| `R39` | `10K` | 与官方对比更接近 |
| `C39` | `0.47uF` | 修正上一版参数差异 |

仍需在装配/bring-up 前确认：

```text
1. JP6 / JP7 / JP9 / JP10 默认跳帽状态
2. D1 / D3 替代型号是否接受
3. C39 0.47uF 0402 的有效容量和耐压
4. TF 卡相关 RES_Chip 占位阻值或 DNP
5. DRC 剩余丝印间距问题是否已经在投板版本处理
```

## 7. 主机板网表中的关键连接证据

从 Sheet6 网表可以看到，主机板围绕 AD2428BCPZ 已经建立了几条关键链路。

### 7.1 MCU I2C 配置 AD2428

| 网络 | 网表证据 | 说明 |
| --- | --- | --- |
| `I2C_SCL` | `CN4.13 / JP8.4 / R34.1 / U1.4` | `R34=4.7K` 上拉到 `+3V3` |
| `I2C_SDA` | `CN2.4 / JP8.2 / R35.1 / U1.5` | `R35=4.7K` 上拉到 `+3V3` |

这对应第一层 I2C：

```text
STM32 I2C -> AD2428 main
```

后续如果要通过 A2B remote I2C 访问远端 sensor，还会有第二层：

```text
STM32 I2C
  ↓
AD2428 main
  ↓ A2B bus
AD2428 subordinate
  ↓
sensor I2C
```

注意：远端 sensor 的 SCL/SDA 不是 STM32 直接拉 1.8 m 过去，而是通过 A2B remote I2C 间接访问。

### 7.2 主机侧 TDM/SAI

| 链路 | 网表证据 | 结论 |
| --- | --- | --- |
| MCU BCLK -> AD2428 | `BCLK: CN3.18 / JP8.9 / R24.1 -> R24.2 -> U1.10` | OK |
| MCU FS/SYNC -> AD2428 | `SAI1_FS_A: CN3.16 / JP8.10 / R25.1 -> R25.2 -> U1.11` | OK |
| AD2428 DTX0 -> MCU RX | `U1.12 -> R26 -> DTX0 -> CN3.20 / JP8.5` | OK |
| AD2428 DTX1 -> MCU RX | `U1.13 -> R27 -> DTX1 -> CN3.22 / JP8.6` | OK |
| AD2428 DRX0/DRX1 | `U1.14 -> R28 -> DRX0 -> JP8.7`；`U1.15 -> R29 -> DRX1 -> JP8.8` | 当前主机上行采集可不接 MCU |

这符合当前目标：

```text
远端 sensor 数据
  -> subordinate upstream slots
  -> main AD2428 DTX0/DTX1
  -> MCU SAI RX
```

如果后续要 MCU 给远端节点发送同步下行数据，再考虑 DRX0/DRX1 的下行用途。

### 7.3 A2B 差分总线接口

| 端口 | 网表路径 | 结论 |
| --- | --- | --- |
| B 口 BP | `U1.22 BP -> L2 -> XMER1.2 -> XMER1.3 -> C19 -> BP_OUT -> JP3.1` | OK |
| B 口 BN | `U1.23 BN -> L6 -> XMER1.1 -> XMER1.4 -> C25 -> BN_OUT -> JP3.2` | OK |
| A 口 AP | `U1.19 AP -> L8 -> XMER2.1 -> XMER2.4 -> C35 -> AP_OUT -> JP5.2` | OK/可选 |
| A 口 AN | `U1.18 AN -> L11 -> XMER2.2 -> XMER2.3 -> C41 -> AN_OUT -> JP5.1` | OK/可选 |

共模电感绕组没有跨错。需要注意的是，`JP3` 和 `JP5` 的正负脚顺序不完全一致：

```text
JP3.1 = BP_OUT
JP3.2 = BN_OUT

JP5.1 = AN_OUT
JP5.2 = AP_OUT
```

这不是电气错误，但必须在丝印、线束图和 bring-up 文档中写清楚，避免线缆接反。

### 7.4 电源与调试点

| 项目 | 网表证据 | 说明 |
| --- | --- | --- |
| AD2428 VIN | `U1.30` 接 VIN 相关去耦和 A2B_POWER 路径 | 依赖跳线/外部供电建立 |
| VOUT1 | `U1.1/2/3/32`，并有 `C10/C11=0.1uF`、`C12=4.7uF` | 1.9 V 内部 regulator 输出 |
| VOUT2 | `U1.9/20/21/29`，并有 `C7=0.01uF`、`C8=0.1uF`、`C9=4.7uF` | IOVDD/TRXVDD 相关 |
| EPAD/GND | `U1.25/U1.31/U1.33=GND` | EPAD 已接地 |
| IRQ | `U1.6 -> R20 -> IRQ -> CN2.14 / CN3.15 / JP8.11 / TP1 / LED` | 可用于 bring-up 和错误状态观察 |

## 8. EMC/RI 定位不能只看最终数据异常

RI 扫频时如果数据异常，不能直接下结论说 sensor 坏了或协议错了。异常可能来自：

```text
1. BCLK 被干扰
2. SYNC 被干扰
3. DATA 被干扰
4. sensor 电源被干扰
5. sensor 模拟前端被干扰
6. sensor 数字内核异常
7. MCU SAI 接收异常
8. DMA overrun / frame error
9. 地回路共模电流
```

所以应该做对照实验矩阵。

## 9. 最关键的定位方法：假 TDM pattern

不要一开始就拿真实 sensor 做完整 RI 扫频。推荐先在 sensor 端用一个可控源输出固定 TDM pattern：

```text
CH0 = 0x55555555
CH1 = 0xAAAAAAAA
CH2 = frame_counter
CH3 = ~frame_counter
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
| 假 TDM pattern 正常，真实 sensor 错 | sensor 本体、电源、模拟前端、寄存器状态 |
| frame counter 不连续 | 帧丢失、接收错位、DMA/SAI 异常 |
| slot 位置错 | TDM 配置、SYNC 极性、slot offset |
| 数据物理量漂移但帧完整 | sensor 本体或模拟链路受扰 |

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

更像 sensor 本体异常的现象：

```text
TDM 帧结构完整
frame counter 连续
SAI/DMA 无错误
数据噪声变大、偏置漂移、饱和、卡死
sensor 状态寄存器异常
sensor 电源/参考电压有纹波或跌落
短线时同样频点也异常
```

## 10. 如果被迫裸 TDM 长线，最低限度怎么做

如果标准或临时验证强制要求裸 TDM 拉 1.8 m，至少不要散线乱飞。

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
BCLK / SYNC / DATA0 / DATA1 / VDD / GND 一排散线直接拉 1.8 m
```

串联电阻建议预留：

```text
BCLK：驱动端串 22 Ω ~ 100 Ω
SYNC：驱动端串 22 Ω ~ 100 Ω
MCLK：驱动端串 22 Ω ~ 100 Ω
DATA：sensor 端串 22 Ω ~ 100 Ω
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

## 11. AD2428 主机板首板 bring-up 路线

### Step 1：先跑通 AD2428 main 本体

先不接远端节点。

检查：

```text
限流上电
VIN 是否在目标范围
VOUT1 是否约 1.9 V
VOUT2/IOVDD 是否约 3.3 V
I2C 是否能读 AD2428 main ID
IRQ/状态寄存器是否正常
```

### Step 2：两颗 AD2428 跑通 A2B link

目标：

```text
STM32 能配置 AD2428 main
main 能发现 subordinate
能读 subordinate ID/status
A2B link 稳定
```

这一步只证明 A2B 基础链路正常，还不急着证明 sensor 数据。

### Step 3：确认远端 BCLK/SYNC

A2B link 建立后，在 sensor 端 AD2428 subordinate 测：

```text
BCLK
SYNC
```

确认：

```text
BCLK 是否为目标频率，例如 3.072 MHz
SYNC 是否为目标采样率，例如 48 kHz
SYNC 极性是否匹配 sensor
帧同步宽度是否匹配 sensor
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

### Step 5：再接真实 sensor

确认：

```text
远端 sensor I2C 是否能配置
sensor 是否根据 BCLK/SYNC 正常输出 TDM
DTX0/DTX1 数据 slot 含义是否正确
X/Y/Z/status 是否对应正确
状态位是否正常
量程/单位是否正确
```

### Step 6：最后做 EMC/RI

推荐顺序：

```text
无 RF baseline
短线真实 sensor
A2B 长线假 pattern
A2B 长线真实 sensor
失败频点定频驻留
完整扫频
```

每次只改一个变量，避免最后只能猜。

## 12. 设计检查清单

### 架构检查

```text
[ ] MCU 端是否是 AD2428 main？
[ ] sensor 端是否是 AD2428 subordinate？
[ ] sensor 和 subordinate 是否靠近，TDM 是否保持短距离？
[ ] 长距离是否只走 A2B AP/AN 或 BP/BN 差分线？
[ ] 是否避免 1.8 m 裸 BCLK/SYNC/DATA？
```

### 电平检查

```text
[ ] AD2428 IOVDD 是 1.8 V 还是 3.3 V？
[ ] sensor I2C IO 电平是否匹配？
[ ] sensor TDM IO 电平是否匹配？
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
[ ] 是否按 ADI 推荐使用 100 Ω 差分线缆？
[ ] 是否有共模电感？
[ ] 是否有 ESD/TVS？
[ ] connector pinout 是否避免差分对交叉？
[ ] 是否预留 EMC 调试器件？
```

### 调试检查

```text
[ ] 能读 AD2428 main ID？
[ ] 能发现 subordinate？
[ ] 能读 subordinate ID/status？
[ ] sensor 端 BCLK/SYNC 是否输出？
[ ] 假 TDM pattern 是否能无误传输？
[ ] 真实 sensor I2C 是否能配置？
[ ] 真实 sensor TDM 数据是否 slot 对齐？
[ ] RI 失败时是否记录 frame counter / SAI error / sensor status？
```

## 13. 总结

这次从裸 TDM 拉 1.8 m 切到 A2B 的方向是成立的。真正要记住的是：

```text
1. TDM 不是完整通信协议，而是同步串行多通道数据帧格式。
2. 裸 TDM 适合板级/短距离，不适合承担 1.8 m 线缆通信。
3. 标准要求 1.8 m 线束做 RI/扫频，不代表裸 TDM 是合理产品方案。
4. A2B 的作用是把本地 I2S/TDM、同步、控制信息封装到单对差分线上。
5. TDM sensor 场景优先用 AD2428，不能把 AD2426/AD2427 混用理解。
6. MCU 端 AD2428 是 main，sensor 端 AD2428 是 subordinate。
7. main 端 BCLK/SYNC 由 STM32 提供给 AD2428；subordinate 端 BCLK/SYNC 由 AD2428 输出给 sensor。
8. sensor 数据从 subordinate 回到 main，属于 upstream slots。
9. 首板验证顺序：A2B link -> BCLK/SYNC -> 假 pattern -> 真实 sensor -> EMC。
```

项目工程上的一句话判断：

> **AD2428 主机板的核心通信链路、电源主路径、I2C/TDM 关键连接已经具备首板验证基础；后续重点从“接线是否正确”转向“配置、诊断和 EMC 定位是否可控”。**
