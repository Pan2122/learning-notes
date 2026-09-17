---
layout: doc
title: 为什么 MEMS 加速度计常用 Sigma-Delta ADC、低通滤波与 FIR
description: 从 MEMS 机械结构、差分电容和 Sigma-Delta ADC 出发，理解低通滤波、抽取、FIR、带宽、噪声与延迟之间的关系。
tags:
  - MEMS
  - 加速度计
  - Sigma-Delta ADC
  - FIR
  - 数字滤波
---

# 为什么 MEMS 加速度计常用 Sigma-Delta ADC、低通滤波与 FIR

数字 MEMS 加速度计并不是直接“测加速度并输出数字值”。它通常经过机械感知、模拟前端、模数转换、数字滤波和校准等多个环节。理解 Sigma-Delta ADC、FIR 和 Low-Pass Filter，应该先从完整的信号链开始。

## 1. 从完整信号链开始理解

一个典型的数字 MEMS 加速度计信号链如下：

![MEMS 加速度计典型信号链](/images/hardware/mems-accelerometer-sigma-delta/signal-chain.svg)

```text
外部加速度 a(t)
        ↓
MEMS Proof Mass + Spring
        ↓
机械位移 x(t)
        ↓
差分电容 ΔC
        ↓
AFE / Charge Amplifier
        ↓
Demodulator
        ↓
Analog Low-Pass Filter
        ↓
Sigma-Delta Modulator
        ↓
高速 bit stream
        ↓
Digital Low-Pass Filter
        ↓
Decimation
        ↓
FIR / Sinc / IIR 等数字滤波
        ↓
Offset / Gain / Temperature Calibration
        ↓
数字加速度输出
        ↓
SPI / I²C / PSI5
```

理解 Sigma-Delta ADC、FIR、Low-Pass Filter 之前，首先需要理解：**MEMS 加速度计本身是一个机械系统。**

## 2. MEMS 加速度计真正测的是位移

一个 MEMS 加速度计可以近似看成经典的质量—弹簧—阻尼系统：

```text
          Spring k

Fixed ───/\/\/\/───[ Proof Mass m ]
                    |
                  Damper c
```

其运动方程为：

$$
m\ddot{x}+c\dot{x}+kx=-ma
$$

其中：

- $m$：质量块质量；
- $k$：弹簧刚度；
- $c$：阻尼；
- $x$：质量块相对于框架的位移；
- $a$：芯片受到的外部加速度。

其传递函数可以写为：

$$
\frac{X(s)}{A(s)}=-\frac{1}{s^2+2\zeta\omega_0s+\omega_0^2}
$$

其中：

$$
\omega_0=\sqrt{\frac{k}{m}}
$$

是机械系统的自然角频率。

当输入频率远低于机械谐振频率时：

$$
f\ll f_0
$$

可以近似得到：

$$
x\approx-\frac{a}{\omega_0^2}
$$

因此：

$$
x\propto a
$$

这就是 MEMS 加速度计正常工作的基础。换句话说：

> 在远离机械谐振的频段内，质量块位移与输入加速度近似成正比。

## 3. 为什么 MEMS 加速度计存在 Mechanical Resonance

MEMS 并不是一个从 DC 到无限高频都具有恒定灵敏度的系统。随着输入频率接近其自然谐振频率 $f_0$，质量块的响应会明显增强：

```text
Sensitivity
    ↑
    │               /\
    │              /  \
    │_____________/    \_______
    │
    └────────────────────────→ Frequency
                    f0
```

因此实际加速度计通常不会把工作带宽一直做到机械谐振附近。实际可用带宽一般会明显低于 $f_0$，这样可以获得：

- 更平坦的 Scale Factor；
- 更好的相位特性；
- 更低的机械谐振影响；
- 更好的线性度。

因此，**机械结构本身就是整个加速度计频率响应的一部分。**

## 4. MEMS 如何把机械位移变成电信号

电容式 MEMS 加速度计通常采用差分电容结构。

静止时：

$$
C_1=C_2
$$

质量块向一侧移动后：

$$
C_1\uparrow,\qquad C_2\downarrow
$$

定义差分电容：

$$
\Delta C=C_1-C_2
$$

对于小位移：

$$
\Delta C\propto x
$$

又因为 $x\propto a$，所以：

$$
\boxed{\Delta C\propto a}
$$

整个物理转换过程可以概括为：

```text
Acceleration
    ↓
Proof Mass Displacement
    ↓
Differential Capacitance
    ↓
AFE
    ↓
Electrical Signal
```

但这里有一个重要问题：**MEMS 引起的电容变化通常非常小。** 所以后面的模拟前端和 ADC 必须具备很低的噪声以及很高的分辨率。

## 5. 为什么 MEMS 加速度计特别适合 Sigma-Delta ADC

MEMS 加速度计的信号通常具有如下特征：

- 带宽不高；
- DC 信息很重要，例如重力；
- 低频精度要求高；
- 信号幅度小；
- 对 Noise Density 和 RMS Noise 非常敏感；
- 通常不需要 MHz 级信号带宽。

例如：

```text
0 Hz          Gravity
1~10 Hz       人体运动
10~100 Hz     低频机械振动
100~1000 Hz   设备、汽车、结构振动
更高频率       接近机械共振区域
```

这类“低带宽 + 高精度”应用，正好属于 Sigma-Delta ADC 的优势范围。

## 6. Sigma-Delta ADC 的核心思想

Sigma-Delta ADC 最重要的三个概念是：

$$
\boxed{\text{Oversampling}+\text{Noise Shaping}+\text{Digital Filtering}}
$$

它和 SAR ADC 的思路很不一样。

SAR ADC 倾向于：

> 对某一个采样时刻的输入电压直接进行高精度量化。

而 Sigma-Delta ADC 更像：

> 用非常高的频率连续观察输入，再通过反馈和数字处理，从大量低分辨率样本中恢复高精度结果。

## 7. Oversampling：用采样率换精度

假设一个加速度计真正关心的带宽只有：

$$
BW=500\ \text{Hz}
$$

按照 Nyquist 定理，只需要：

$$
f_s>1\ \text{kHz}
$$

理论上即可采样。但 Sigma-Delta Modulator 内部可能工作在 $1\ \text{MHz}$ 甚至更高频率。

定义 Oversampling Ratio：

$$
OSR=\frac{f_{\mathrm{MOD}}}{2BW}
$$

例如：

$$
f_{\mathrm{MOD}}=1\ \text{MHz},\qquad BW=500\ \text{Hz}
$$

则：

$$
OSR=\frac{1\ \text{MHz}}{2\times500\ \text{Hz}}=1000
$$

量化噪声会被分布到一个非常宽的频率范围内。真正有用的 $0\sim500\ \text{Hz}$ 只占整个 Nyquist 带宽中的很小一部分，之后通过 Low-Pass Filter 去掉高频内容，就可以降低带内量化噪声。

## 8. Noise Shaping：Sigma-Delta 真正强大的地方

Oversampling 本身可以降低带内量化噪声，但效率不足以支持非常高的分辨率。Sigma-Delta 的关键优势在于 **Noise Shaping**。

![Sigma-Delta 中的噪声整形示意](/images/hardware/mems-accelerometer-sigma-delta/sigma-delta-noise-shaping.svg)

普通 ADC 的量化噪声可以粗略理解为在频域中较均匀分布：

```text
Noise
 ↑
 │██████████████████████
 │
 └──────────────────────→ Frequency
```

而 Sigma-Delta Modulator 利用积分器、量化器、DAC 和 Feedback Loop，使量化噪声频谱发生变化：

```text
Noise
 ↑
 │                         █████
 │                    █████
 │                ████
 │           █████
 │_____█████____________________→ Frequency
```

结果就是：

> 低频量化噪声明显减少，而大量量化噪声被“推”到高频。

由于 MEMS 加速度信息主要位于低频区域，因此这种 Noise Shaping 与 MEMS 的物理信号特点非常匹配。

## 9. 为什么 Sigma-Delta 后面一定需要 Low-Pass Filter

Noise Shaping 并没有让噪声消失，它只是把噪声从低频移到了高频。因此 Sigma-Delta 后面必须存在数字低通滤波：

```text
Sigma-Delta Modulator
      ↓
High-rate Data Stream
      ↓
Digital LPF
      ↓
Decimation
      ↓
Low-rate High-resolution Data
```

数字 LPF 负责：

- 去掉 Noise Shaping 产生的大量高频量化噪声；
- 限制输出带宽；
- 为 Decimation 提供 Anti-Alias；
- 降低最终 RMS Noise。

因此：

$$
\boxed{\text{Sigma-Delta}+\text{Digital Low-Pass}+\text{Decimation}}
$$

实际上应该被看作一个完整系统，而不是三个独立模块。

## 10. Decimation 是什么

假设 Sigma-Delta Modulator 的内部采样频率为 $1\ \text{MHz}$，但最终传感器只需要 $ODR=1\ \text{kHz}$，那么没有必要每秒输出一百万个样本。因此会进行：

```text
1 MHz Modulator Data
       ↓
Digital LPF
       ↓
Decimation
       ↓
1 kHz Output Data
```

所以非常重要的一点是：

$$
\boxed{ODR\ne\text{ADC 内部采样频率}}
$$

一个 ODR 只有 1 kHz 的 MEMS Sensor，其内部 Modulator 很可能工作在几百 kHz 甚至 MHz。

## 11. Sigma-Delta 与 SAR ADC 的区别

| 特性 | Sigma-Delta ADC | SAR ADC |
| --- | --- | --- |
| 典型优势 | 低频高精度 | 中高速、低延迟 |
| 分辨率 | 很高 | 中高 |
| Noise Shaping | 有 | 无 |
| Oversampling | 核心机制 | 可有可无 |
| 数字滤波 | 核心组成 | 通常不是必须 |
| Latency | 较大 | 较低 |
| 适合 MEMS | 很适合 | 也可使用 |
| 高频性能 | 一般 | 更好 |

对于“低频 + 高分辨率 + 低噪声 + 较低带宽”应用，Sigma-Delta 往往更有优势。

## 12. MEMS 甚至可以被直接放进反馈环

部分高性能 MEMS Sensor 并不是简单的：

```text
MEMS
 ↓
AFE
 ↓
Sigma-Delta ADC
```

而可能采用闭环架构：

```text
                    Electrostatic Feedback
                           ↑
                           │
Acceleration → MEMS → Sense → Sigma-Delta
               ↑             │
               └─────────────┘
```

这类架构通常称为：

- Force Feedback；
- Force Rebalance；
- Closed-loop MEMS。

其思想是：

> 当质量块发生位移时，通过静电力把质量块重新拉回接近零位。

因此最终测量的其实可以理解成：

> 为了抵消外部加速度，需要施加多大的反馈力。

这种架构可以改善：

- 线性度；
- Dynamic Range；
- 可用带宽；
- 机械非线性；
- 大信号响应。

## 13. 除了 Sigma-Delta，还有哪些 ADC

### 13.1 SAR ADC

SAR ADC 采用逐次逼近思想，本质类似二分查找。

优点：

- 低延迟；
- 功耗较低；
- 中高分辨率；
- 电路成熟。

MCU 内部 ADC 很多就是 SAR 架构。

### 13.2 Flash ADC

Flash ADC 使用大量 Comparator 同时比较输入。对于 N-bit ADC，理论上需要：

$$
2^N-1
$$

个 Comparator。

优点是转换速度极快；缺点是面积大、功耗大，并且 Comparator 数量随位数指数增长。因此它主要用于高速通信、示波器、RF 等领域。

### 13.3 Pipeline ADC

Pipeline ADC 把转换过程拆成多级，每一级完成部分量化。

优势：

- 高速；
- 较高分辨率。

代价：

- 存在 Pipeline Latency；
- 电路复杂度较高。

它常见于高速数据采集和通信系统。

### 13.4 Integrating ADC

例如 Dual-Slope ADC。

优点：

- 高精度；
- 工频抑制能力好。

缺点是转换速度非常慢，所以数字万用表中比较常见。

## 14. Low-Pass Filter 与 FIR 不是一个维度的概念

这是非常容易混淆的地方。

Low-Pass Filter 描述的是：

> **滤波器的频率功能。**

例如：

- LPF；
- HPF；
- BPF；
- Band-stop Filter。

而 FIR 描述的是：

> **数字滤波器的数学结构。**

所以完全可以存在：

```text
FIR Low-Pass Filter
```

也可以存在：

```text
IIR Low-Pass Filter
```

因此：

$$
\boxed{\text{LPF}=\text{滤什么}},\qquad \boxed{\text{FIR}=\text{怎么滤}}
$$

## 15. 为什么加速度计几乎一定需要 LPF

至少有四个主要原因：限制 Noise Bandwidth、抑制 Mechanical Resonance、实现 Anti-Aliasing，以及为后级数字处理提供合适的带宽边界。

### 15.1 限制 Noise Bandwidth

假设 Noise Density 为：

$$
n_d=100\ \mu g/\sqrt{\text{Hz}}
$$

RMS Noise 可以近似写成：

$$
a_{\mathrm{RMS}}\approx n_d\sqrt{BW}
$$

如果 $BW=100\ \text{Hz}$，那么：

$$
a_{\mathrm{RMS}}\approx 100\ \mu g/\sqrt{\text{Hz}}\times\sqrt{100\ \text{Hz}}=1\ \text{mg}
$$

如果 $BW=10\ \text{kHz}$，则：

$$
a_{\mathrm{RMS}}\approx 10\ \text{mg}
$$

这里是便于理解的理想化估算，实际应根据滤波器的 Equivalent Noise Bandwidth 计算。即使 Sensor 本身的 Noise Density 完全没变化，带宽越宽，积分进去的总噪声也越大。

### 15.2 抑制 Mechanical Resonance

MEMS 本身具有机械谐振峰。假设：

$$
f_{\mathrm{res}}=5\ \text{kHz}
$$

但应用只关心：

$$
0\sim500\ \text{Hz}
$$

那么没有必要让接近 5 kHz 的信号进入后续链路，否则：

- 高频外部振动可能被机械谐振放大；
- Sensor 更容易出现非线性；
- 后级 ADC 可能被大信号占用动态范围。

因此 LPF 可以帮助信号链把工作区域限制在机械响应最平坦的范围。

### 15.3 用于 Anti-Aliasing

假设：

$$
ODR=1\ \text{kHz}
$$

则 Nyquist Frequency 为：

$$
f_N=\frac{ODR}{2}=500\ \text{Hz}
$$

如果真实世界中存在 900 Hz 振动，那么采样后可能折叠成：

$$
|900-1000|=100\ \text{Hz}
$$

ADC 最终会看到一个假的 100 Hz 信号。

一旦 Alias 已经发生，后面的数字滤波无法判断这个 100 Hz 到底是真实的，还是 900 Hz 折叠过来的。因此 ADC 前后不同阶段通常都需要 Anti-Alias 设计。

## 16. FIR Filter 是什么

FIR 是 Finite Impulse Response 的缩写，其通用表达式为：

$$
y[n]=\sum_{k=0}^{N}b_kx[n-k]
$$

展开后就是：

$$
y[n]=b_0x[n]+b_1x[n-1]+\cdots+b_Nx[n-N]
$$

最简单的 Moving Average 就是一种 FIR：

$$
y[n]=\frac{1}{4}\left[x[n]+x[n-1]+x[n-2]+x[n-3]\right]
$$

例如输入：

```text
Raw:
10, 18, 8, 16

Average:
13
```

快速变化的高频分量会在平均过程中互相抵消，而慢变化的低频信号更容易保留下来。因此 Moving Average 本质上就是一种 FIR Low-Pass Filter。

## 17. Sensor 为什么喜欢 FIR

### 17.1 稳定

FIR 没有输出反馈，因此天然不存在 IIR 那种 Pole Stability 问题。

### 17.2 可以实现 Linear Phase

如果 FIR 系数满足：

$$
b_k=b_{N-k}
$$

则可以实现线性相位。也就是说，不同频率的信号会产生近似一致的 Group Delay，从而较好保留波形形状。

### 17.3 Stopband 可以设计得很好

FIR 很适合实现：

- Anti-Alias；
- Decimation；
- 精确带宽限制；
- 强 Stopband Rejection。

因此 Sigma-Delta ADC 的数字 Decimation Filter 中非常常见。

## 18. FIR 最大的缺点：Latency

对于 Linear-Phase FIR：

$$
\text{Group Delay}=\frac{N-1}{2}
$$

单位为 Sample。

例如：

$$
N=101
$$

那么延迟约为 50 Samples。假设：

$$
ODR=1\ \text{kHz}
$$

则：

$$
\text{Delay}=\frac{50}{1000}=50\ \text{ms}
$$

这对慢速监测可能完全可以接受，但对于 ABS、ESC、Airbag、Robot Control 和 Fast Feedback Loop 等场景可能就不可接受。

因此 Sensor 系统中存在一个非常重要的 Trade-off：

$$
\boxed{\text{Noise}\leftrightarrow\text{Bandwidth}\leftrightarrow\text{Latency}}
$$

通常：

```text
Bandwidth ↓
→ RMS Noise ↓
→ Filter 更强
→ Latency ↑
```

## 19. FIR 与 IIR 的区别

IIR 包含反馈：

$$
y[n]=b_0x[n]+b_1x[n-1]-a_1y[n-1]
$$

优势：

- 用较低阶数实现很陡的滤波；
- 运算量小；
- Latency 可以较低。

缺点：

- Phase 通常不是线性的；
- 存在稳定性问题；
- 对定点量化比较敏感。

因此实际 Sensor 中可能同时存在：

```text
Sigma-Delta Decimation
→ CIC / Sinc / FIR

Application LPF
→ FIR 或 IIR
```

并不存在“Sensor 一定只用 FIR”的说法。

## 20. 整个加速度计的 Frequency Response

真正的传感器响应不是某一个模块决定的，可以粗略写成：

$$
H_{\mathrm{TOTAL}}=H_{\mathrm{MEMS}}\times H_{\mathrm{AFE}}\times H_{\mathrm{AnalogFilter}}\times H_{\mathrm{DigitalFilter}}
$$

所以 Datasheet 中写：

```text
Bandwidth = 400 Hz
```

并不代表 MEMS 机械结构本身只有 400 Hz 带宽。可能实际是：

```text
Mechanical Resonance = 8 kHz
Analog Filter         = 2 kHz
Digital LPF           = 400 Hz

最终输出 BW           = 400 Hz
```

## 21. 可以把加速度计理解成三层滤波

![加速度计三层滤波结构](/images/hardware/mems-accelerometer-sigma-delta/filtering-layers.svg)

### 第一层：Mechanical Filtering

```text
Mass + Spring + Damper
```

MEMS 本身就是一个二阶机械系统。

### 第二层：Analog Filtering

主要解决：

- AFE Noise；
- Carrier Residue；
- Demodulation Ripple；
- Clock Feedthrough；
- 高频干扰；
- Anti-Alias。

### 第三层：Digital Filtering

主要解决：

- Sigma-Delta Quantization Noise；
- Decimation；
- Noise Bandwidth；
- ODR；
- 应用带宽。

因此：

```text
Mechanical System
       ↓
Analog Signal Chain
       ↓
Sigma-Delta Modulator
       ↓
Digital Filtering
       ↓
Application Data
```

## 22. Noise Density、Bandwidth 与 RMS Noise

这一关系在 Sensor 测试中非常重要：

$$
\text{RMS Noise}\approx\text{Noise Density}\times\sqrt{\text{ENBW}}
$$

假设同一个 Sensor 有两种模式：

```text
Mode A: 53 Hz BW
Mode B: 430 Hz BW
```

如果 Noise Density 相同，那么粗略有：

$$
\frac{\text{Noise}_{430}}{\text{Noise}_{53}}
\approx\sqrt{\frac{430}{53}}
\approx2.85
$$

也就是说，即使 Sensor 本身完全没变，只是滤波器带宽从 53 Hz 变成 430 Hz，RMS Noise 就可能接近增加到原来的 2.85 倍。

实际计算应使用 Equivalent Noise Bandwidth，而不是简单使用 -3 dB Bandwidth。

## 23. 最后的核心理解

MEMS 加速度计之所以大量采用 Sigma-Delta ADC，并不是一种习惯，而是由它的物理信号特点决定的：

```text
MEMS Input
│
├── 信号较小
├── 带宽较低
├── DC/低频信息重要
├── 要求较低 Noise
└── 要求较高 Resolution
```

而 Sigma-Delta ADC 正好可以利用 Oversampling，把高采样率换成精度；利用 Noise Shaping，把量化噪声推向高频；再利用 Digital Low-Pass + Decimation，把不需要的高频噪声去掉。

因此：

$$
\boxed{\text{低带宽}+\text{高精度}+\text{低噪声}}
$$

与：

$$
\boxed{\text{Sigma-Delta ADC}}
$$

天然匹配。

## 总结

需要重点记住以下几点：

1. MEMS 加速度计本质是一个 **Mass-Spring-Damper 二阶机械系统**。
2. Sensor 真正检测的是质量块位移，之后通过差分电容转换为电信号。
3. Sigma-Delta ADC 的核心是 **Oversampling + Noise Shaping + Digital Filtering**。
4. Noise Shaping 将量化噪声推到高频，因此 Sigma-Delta 后面必须配合数字 LPF。
5. Low-Pass Filter 可以限制 Noise Bandwidth、抑制机械谐振影响并防止 Aliasing。
6. FIR 与 LPF 不是同一级概念：**LPF 是频率功能，FIR 是滤波器实现结构。**
7. Sensor 的最终带宽由机械、模拟和数字整个信号链共同决定。
8. Noise Density、Bandwidth、RMS Noise 和 Group Delay 是一组高度相关的参数。
9. 在 Sensor 设计中经常存在：

   $$
   \boxed{\text{Noise}\leftrightarrow\text{Bandwidth}\leftrightarrow\text{Latency}}
   $$

理解这些关系之后，再去看 Accelerometer Datasheet 中的 ODR、Bandwidth、Noise Density、RMS Noise、Group Delay、Mechanical Resonance，就会发现这些参数实际上属于同一个完整的信号链系统。
