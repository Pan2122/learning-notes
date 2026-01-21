# Project Architecture & Context
> This document describes the structure and logic of the personal knowledge base built with VitePress.

## 1. Project Overview
* **Type**: Static Site Generator (SSG) via VitePress.
* **Config**: TypeScript (`.vitepress/config.mts`).
* **Content**: Markdown (`.md`).
* **Deployment**: GitHub Pages (Base path: `/learning-notes/`).
* **Package Manager**: npm.

## 2. Directory Structure (Categorization)
* `c-lang/`: Software Engineering, C/C++, Embedded FW.
* `hardware/`: PCB Design, EDA Tools, Circuit Analysis.
* `projects/`: Complete Project Documentation (Portfolio).
* `ideas/`: Daily logs, Flash ideas, Future plans.
* `public/`: Static assets. Images strictly follow `public/images/<category>/<filename>/` structure.

## 3. Configuration Logic (.vitepress/config.mts)
* **Nav Bar**: 5 Top-level items matching the folders above.
* **Sidebar**: Path-based routing. Each category (e.g., `/c-lang/`) has its own independent sidebar object.
    * *Rule*: New files must be appended to the `items` array of the corresponding sidebar key.

## 4. Development Workflow
* **New Post**: Create `.md` file -> Update `sidebar` in `config.mts` -> (Optional) Create image folder.
* **Commands**:
    * `npm run docs:dev` (Preview)
    * `npm run docs:build` (Build)
    * `npm run docs:preview`(Preview Build Results)