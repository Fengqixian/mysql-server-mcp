/**
 * MCP Server实现
 * 基于@modelcontextprotocol/sdk实现MySQL工具服务
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const DatabaseManager = require('./database');
const SQLValidator = require('./validators');
const config = require('./config');

class MCPMySQLServer {
  constructor() {
    this.server = new Server({
      name: config.mcp.name,
      version: config.mcp.version,
    }, {
      capabilities: {
        tools: {},
      },
    });
    
    this.dbManager = new DatabaseManager();
    this.validator = new SQLValidator();
    this.setupHandlers();
  }

  /**
   * 设置MCP服务器处理器
   */
  setupHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "execute_sql",
            description: "执行SQL只读查询，仅支持SELECT、SHOW、DESCRIBE、EXPLAIN操作，禁止任何写入操作",
            inputSchema: {
              type: "object",
              properties: {
                sql: {
                  type: "string",
                  description: "要执行的只读SQL语句（SELECT/SHOW/DESCRIBE/EXPLAIN）"
                },
                params: {
                  type: "array",
                  description: "SQL查询参数（可选）",
                  items: {
                    type: ["string", "number", "boolean", "null"]
                  }
                }
              },
              required: ["sql"]
            }
          },
          {
            name: "get_tables_info",
            description: "获取数据库表结构信息",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "get_connection_status",
            description: "获取数据库连接状态",
            inputSchema: {
              type: "object",
              properties: {}
            }
          }
        ]
      };
    });

    // 执行工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "execute_sql":
            return await this.handleExecuteSQL(args);
          
          case "get_tables_info":
            return await this.handleGetTablesInfo();
          
          case "get_connection_status":
            return await this.handleGetConnectionStatus();
          
          default:
            throw new Error(`未知的工具: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `错误: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * 处理SQL执行请求
   * @param {Object} args - 请求参数
   * @returns {Object} 执行结果
   */
  async handleExecuteSQL(args) {
    const { sql, params = [] } = args;

    // 验证SQL语句
    const sqlValidation = this.validator.validateSQL(sql);
    if (!sqlValidation.isValid) {
      return {
        content: [
          {
            type: "text",
            text: `SQL验证失败: ${sqlValidation.error}`
          }
        ],
        isError: true
      };
    }

    // 验证参数
    const paramsValidation = this.validator.validateParams(params);
    if (!paramsValidation.isValid) {
      return {
        content: [
          {
            type: "text",
            text: `参数验证失败: ${paramsValidation.error}`
          }
        ],
        isError: true
      };
    }

    // 执行SQL
    const result = await this.dbManager.executeQuery(sql, params);
    
    if (result.success) {
      let responseText = `✓ 查询执行成功\n`;
      responseText += `操作类型: ${result.operation}\n`;
      responseText += `执行时间: ${result.executionTime}ms\n`;
      responseText += `返回行数: ${result.rowCount}\n`;
      
      if (result.data && result.data.length > 0) {
        responseText += `\n查询结果:\n`;
        responseText += JSON.stringify(result.data, null, 2);
      }

      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `✗ SQL执行失败: ${result.error}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * 处理获取表信息请求
   * @returns {Object} 表信息
   */
  async handleGetTablesInfo() {
    const result = await this.dbManager.getTablesInfo();
    
    if (result.success) {
      let responseText = `数据库表信息:\n\n`;
      
      for (const table of result.data) {
        responseText += `表名: ${table.name}\n`;
        responseText += `字段信息:\n`;
        
        for (const column of table.columns) {
          responseText += `  - ${column.Field} (${column.Type}) ${column.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${column.Key ? column.Key : ''}\n`;
        }
        responseText += `\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `获取表信息失败: ${result.error}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * 处理获取连接状态请求
   * @returns {Object} 连接状态
   */
  async handleGetConnectionStatus() {
    const isActive = this.dbManager.isConnectionActive();
    
    return {
      content: [
        {
          type: "text",
          text: `数据库连接状态: ${isActive ? '已连接' : '未连接'}`
        }
      ]
    };
  }

  /**
   * 启动MCP服务器
   */
  async start() {
    try {
      // 初始化数据库连接
      await this.dbManager.initialize();
      
      // 启动MCP服务器
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.log(`✓ MCP MySQL Server 启动成功`);
      console.log(`服务器名称: ${config.mcp.name}`);
      console.log(`服务器版本: ${config.mcp.version}`);
    } catch (error) {
      console.error('✗ MCP服务器启动失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 停止服务器
   */
  async stop() {
    await this.dbManager.close();
    console.log('✓ MCP服务器已停止');
  }
}

module.exports = MCPMySQLServer;