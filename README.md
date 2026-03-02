# MCP MySQL Server

一个基于 Model Context Protocol (MCP) 的 MySQL 数据库查询服务器，为 AI 助手提供安全的只读数据库访问能力。

## 功能特性

- **只读查询**：仅支持 SELECT、SHOW、DESCRIBE、EXPLAIN 操作，禁止任何写入操作
- **SQL 注入防护**：内置多层 SQL 注入检测和危险操作拦截
- **连接池管理**：使用 mysql2 连接池，支持高并发查询
- **查询超时控制**：默认 30 秒查询超时，防止长时间查询占用资源
- **错误信息脱敏**：对数据库错误进行脱敏处理，避免泄露敏感信息
- **参数化查询**：支持参数化查询，进一步防止 SQL 注入

## 提供的工具

| 工具名称 | 描述 |
|---------|------|
| `execute_sql` | 执行只读 SQL 查询（SELECT/SHOW/DESCRIBE/EXPLAIN） |
| `get_tables_info` | 获取数据库所有表的结构信息 |
| `get_connection_status` | 获取数据库连接状态 |

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd mysql-server-mcp

# 安装依赖
npm install
```

## 配置

在 Cursor 的 MCP 配置文件中添加此服务器，通过 `env` 字段配置数据库连接信息。

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `DB_HOST` | 数据库主机地址 | `localhost` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | - |
| `DB_NAME` | 数据库名称 | - |

### Windows

配置文件路径：`%APPDATA%\Cursor\mcp.json`

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["D:/***/mysql-server-mcp/index.js"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "your_user",
        "DB_PASSWORD": "your_password",
        "DB_NAME": "your_database"
      }
    }
  }
}
```

### macOS / Linux

配置文件路径：`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/path/to/mysql-server-mcp/index.js"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "your_user",
        "DB_PASSWORD": "your_password",
        "DB_NAME": "your_database"
      }
    }
  }
}
```

## 使用示例

配置完成后，AI 助手可以使用以下方式查询数据库：

### 执行 SQL 查询

```
查询用户表的所有数据：
SELECT * FROM users LIMIT 10
```

### 查看表结构

```
获取数据库中所有表的结构信息
```

### 参数化查询

```
查询指定用户：
SELECT * FROM users WHERE id = ?
参数: [1]
```

## 安全特性

### 只读模式

服务器强制只读模式，仅允许以下操作：
- `SELECT` - 数据查询
- `SHOW` - 显示数据库/表信息
- `DESCRIBE` / `DESC` - 查看表结构
- `EXPLAIN` - 查询执行计划

### SQL 注入防护

内置多种 SQL 注入检测模式：
- DDL 操作拦截（DROP、ALTER、CREATE 等）
- 危险函数拦截（LOAD_FILE、INTO OUTFILE 等）
- 注入模式检测（UNION SELECT、注释符号等）
- 系统表访问限制（information_schema、mysql.user 等）

### 查询限制

- SQL 语句最大长度：10,000 字符
- 查询超时时间：30 秒
- 参数数量上限：100 个
- 字符串参数最大长度：65,535 字符

## 项目结构

```
mysql-server-mcp/
├── src/
│   ├── server.js      # MCP 服务器实现
│   ├── database.js    # 数据库连接和查询管理
│   ├── validators.js  # SQL 验证器
│   └── config.js      # 配置管理
├── index.js           # 入口文件
├── package.json
└── README.md
```

## 依赖

- `@modelcontextprotocol/sdk` - MCP 协议 SDK
- `mysql2` - MySQL 数据库驱动
- `dotenv` - 环境变量管理
- `express` - Web 框架（可选）
- `helmet` - 安全中间件
- `cors` - 跨域支持
- `express-rate-limit` - 请求限流

## 开发

```bash
# 开发模式（热重载）
npx nodemon index.js

# 生产模式
node index.js
```