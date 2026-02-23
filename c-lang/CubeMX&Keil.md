---
layout: doc
title: CubeMX+Keil环境迁移、调试避坑
description: CubeMX+Keil环境迁移、调试避坑
tags: 
  - STM32
  - Keil
  - CubeMX
---

# STM32 开发实战笔记：CubeMX+Keil环境迁移、调试避坑

## 🎯 工程环境管理与无损迁移 (CubeIDE -> Keil MDK)

### 1. 核心策略：共存式管理 (Co-existence Strategy)

* ​**原则**​：不要破坏原有的代码结构，不要手动复制粘贴 `.c/.h` 文件。让同一个文件夹下的源码同时支持多种 IDE 打开。
* ​**目录规范**​：
  * `Core/` 与 `Drivers/`：存放由 STM32CubeMX 自动生成和维护的系统代码（HAL库、时钟、引脚初始化）。
  * `MDK-ARM/`：存放 Keil 的工程文件 (`.uvprojx`)。
  * `Hardware/`（或 `BSP/`）：**AE 强烈推荐。** 在根目录新建此文件夹，专门存放自己手写的驱动代码（如 ST7789、BMI160 驱动），实现应用层与底层配置的解耦。

### 2. 迁移实操步骤

1. ​**切换生产车间**​：使用新版 CubeMX 打开旧的 `.ioc` 文件（遇提示选 `Migrate` 升级）。在 `Project Manager` -> `Toolchain / IDE` 中，将 `STM32CubeIDE` 更改为`MDK-ARM`​。
2. ​**优化代码生成**​：在 `Code Generator` 中勾选 `Generate peripheral initialization as a pair of '.c/.h' files`，让外设初始化代码独立，方便阅读和调试。
3. ​**认领私有代码,关键**​：
   * CubeMX 生成代码后，只会把 `Core` 里它自己生成的系统文件加入 Keil 工程。
   * ​**现象**​：编译报 `Error: L6218E: Undefined symbol`（找不到函数实现）。
   * ​**解决**​：在 Keil 左侧 `Project` 窗口手动新建 `Hardware` 分组，使用 `Add Existing Files to Group` 把自己写的 `st7789.c`、`fonts.c` 等文件加进来。
   * ​**切记**​：务必在魔术棒 🪄 -> `C/C++ (AC6)` -> `Include Paths` 中添加自定义驱动头文件所在的文件夹路径。

### 3. Keil AC6 编译器避坑

* ​**报错**​：`uses ARM-Compiler 'Default Compiler Version 5' which is not available`。
* ​**原因​**​：新版 Keil 移除了老旧的 AC5 编译器，但 CubeMX 默认配置未更新。
* ​**解决**​：魔术棒 🪄 -> `Target` -> `ARM Compiler`，手动切换为 `Use default compiler version 6`。

## 🐞 DAP 下载调试与终极 Printf 方案

### 1. CMSIS-DAP 配置标准

* ​**Debug 选项卡**​：下拉选 `CMSIS-DAP Debugger`。进入 `Settings`，Port 必须选 ​**SW**​（Serial Wire），切勿选` JTAG`。
* ​**Flash Download 选项卡**​：务必勾选 ​`Reset and Run`​，实现下载后自动复位运行，解放双手。

### 2. 串口重定向的“半主机模式”暗坑

* ​**现象**​：程序下载后，屏幕卡死、按键失效（假黑屏），只有拔掉调试器复位才能跑。
* ​**原因​**​：标准 C 库的 `printf` 会触发“半主机模式”（Semihosting），试图寻找电脑主机进行打印。如果在脱机状态下运行，CPU 会卡死在这个软件断点处。
* ​**常规解法**​：勾选 `Use MicroLIB`（使用精简微型库）。
  * ​*附带 Bug*​：若报 `Undefined symbol __initial_sp`，说明混入了 GCC 的启动文件。需在 Asm 宏定义中强制添加 `__MICROLIB` 补丁，或彻底替换为 Keil 专属的 `.s` 启动文件。

### 3. AE 级终极方案：手搓 UART\_Printf

为了彻底摆脱系统库的底层束缚，保证代码 100% 跨平台不报错，直接利用可变参数宏手写打印函数：

C

```
#include <stdarg.h>
#include <string.h>

void UART_Printf(const char *format, ...)
{
    char print_buf[128];
    va_list args;
    va_start(args, format);
    vsnprintf(print_buf, sizeof(print_buf), format, args);
    va_end(args);
    HAL_UART_Transmit(&huart1, (uint8_t *)print_buf, strlen(print_buf), 0xFFFF);
}
```