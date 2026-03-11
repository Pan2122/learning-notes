---
layout: doc
title: STM32 串口打印排坑与稳健实现方案
description: 基于 STM32 HAL 库，手搓变参串口打印函数，彻底解决 fputc 重定向导致的程序卡死与 MicroLIB 依赖问题。
tags:
  - STM32
  - UART
  - C语言
  - Debug
---

# STM32 & Keil 串口配置与开发注意事项（拒绝卡死版）

在 STM32 开发中，串口打印（`printf`）是最常用的调试手段。但在使用 HAL 库和 Keil MDK 开发时，传统的 `fputc` 重定向经常会导致程序卡死、死机等莫名其妙的 Bug。本文将从 CubeMX 配置到 Keil 代码实现，提供一套**绝不卡死、绝不报错**的稳健串口打印方案，并对常见的“坑”进行排雷。

## 一、 STM32CubeMX 基础配置

1. ​**时钟配置 RCC**​：
   * 在 `System Core` -> `RCC` 中，将 `High Speed Clock (HSE)` 设置为 `Crystal/Ceramic Resonator`（外部晶振）。
   * 在 `Clock Configuration` 树中，配置好最高主频（如 STM32F411 配置为 100MHz）。
2. ​**串口配置 Connectivity**​：
   * 选择目标串口（例如 `USART1`）。
   * 将 `Mode` 设置为 `Asynchronous`（异步模式）。
   * 在下方 `Parameter Settings` 中：
     * ​**Baud Rate**​: `115200` Bits/s (或根据需求设置)
     * ​**Word Length**​: 8 Bits
     * ​**Parity**​: None
     * ​**Stop Bits**​: 1
3. ​**生成工程**​：
   * 在 `Project Manager` 中设置好工程名和路径。
   * `Toolchain/IDE` 选择 `MDK-ARM`。
   * 勾选 `Generate peripheral initialization as a pair of '.c/.h' files per peripheral`，生成代码。

## 二、 避坑指南：为什么不要用 AI 常推荐的 `fputc` 重定向？

在网上检索或询问 AI 时，经常会得到如下的串口重定向代码：

### ❌ 典型的“翻车”代码版本：

C

```
/* USER CODE BEGIN Includes */
#include <stdio.h>               
/* USER CODE END Includes */

/* USER CODE BEGIN 0 */
extern UART_HandleTypeDef huart2;

// 重定向 printf 的底层输出函数 fputc
int fputc(int ch, FILE *f)
{
    // 危险点 1：HAL_MAX_DELAY
    HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
    return ch;
}
/* USER CODE END 0 */
```

### 💣 踩坑原理解析：

1. ​**无限期死等 (`HAL_MAX_DELAY`)**​：`fputc` 中使用了 `HAL_MAX_DELAY`。如果串口外设出现异常、未初始化完成，或者硬件 TX 线被意外拉低，这行代码会​**永远阻塞**​，导致整个 MCU 卡死在打印函数里，屏幕冻结，按键失效。
2. ​**C 库兼容性问题**​：标准的 `printf` 依赖于底层的 C 库。在 Keil 中，如果没有勾选 `Use MicroLIB`（微库），或者底层的半主机模式（Semihosting）没有被正确关闭，调用 `printf` 会直接导致程序进入 HardFault 或在启动代码的 `__main` 阶段死循环。

## 三、 稳健方案：手搓变参打印函数

为了彻底解决上述问题，我们可以利用 C 语言的变长参数特性（`va_list`）结合 `vsnprintf`，在内存中先将字符串格式化，然后直接调用 HAL 库发送。**完全绕开 `fputc` 和 MicroLIB！**

### ✅ 核心实现代码：

在 `main.c` 中添加以下代码：

C

```
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdarg.h>  // 处理可变参数所需
#include <string.h>  // 处理字符串所需
/* USER CODE END Includes */

/* USER CODE BEGIN 0 */
// 咱们自己手搓的串口打印函数，绝不卡死，绝不报错！
void UART_Printf(const char *format, ...)
{
    char print_buf[128]; // 设定一个128字节的缓冲区，按需调整大小
    va_list args;
    
    // 1. 把格式化的数据拼接到缓冲区里
    va_start(args, format);
    vsnprintf(print_buf, sizeof(print_buf), format, args);
    va_end(args);
    
    // 2. 直接调用 HAL 库发出去
    // 设置合理的超时时间 (如 0xFFFF 或 100ms)，避免死锁
    HAL_UART_Transmit(&huart1, (uint8_t *)print_buf, strlen(print_buf), 0xFFFF);
}
/* USER CODE END 0 */
```

**优势：**

* ​**不挑环境**​：不管 Keil 勾没勾选 MicroLIB 都能跑。
* ​**自带超时**​：`0xFFFF` 是一个有限的超时时间（也可以写成固定的毫秒数，比如 `100`），即使串口拔掉或者硬件故障，函数最终也会返回，​**绝对不会卡死主循环**​。

## 四、 完整 C 语言测试程序示例

这是一个可以直接复制并在主循环中测试的干净结构：

C

```
#include "main.h"
#include "usart.h"
#include "gpio.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

// 声明自定义打印函数
void UART_Printf(const char *format, ...);

void SystemClock_Config(void);

// 实现自定义打印函数
void UART_Printf(const char *format, ...)
{
    char print_buf[128]; 
    va_list args;
    
    va_start(args, format);
    vsnprintf(print_buf, sizeof(print_buf), format, args);
    va_end(args);
    
    HAL_UART_Transmit(&huart1, (uint8_t *)print_buf, strlen(print_buf), 100); // 100ms超时保护
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_USART1_UART_Init();

    // 硬件上电稳定延时
    HAL_Delay(300);

    UART_Printf("System Boot Up Successfully!\r\n");
    UART_Printf("Clock Speed: %d MHz\r\n", SystemCoreClock / 1000000);

    uint32_t counter = 0;

    while (1)
    {
        // 测试不同的格式化输出
        UART_Printf("Running... Loop count: %lu\r\n", counter);
        
        counter++;
        HAL_Delay(1000); // 每秒打印一次
    }
}
```
