/**
 * 数据库连接和操作模块
 * 负责MySQL数据库的连接、查询执行等功能
 */

const mysql = require('mysql2/promise');
const config = require('./config');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * 初始化数据库连接池
   */
  async initialize() {
    try {
      this.pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        connectionLimit: config.database.connectionLimit,
        waitForConnections: config.database.waitForConnections,
        connectTimeout: config.database.connectTimeout,
        queueLimit: config.database.queueLimit,
        multipleStatements: false
      });

      // 测试连接
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this.isConnected = true;
      
    } catch (error) {
      console.error('✗ 数据库连接失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询超时时间（毫秒）
   */
  static QUERY_TIMEOUT = 30000;

  /**
   * SQL语句最大长度
   */
  static MAX_SQL_LENGTH = 10000;

  /**
   * 脱敏错误信息，避免泄露敏感数据库信息
   * @param {Error} error - 原始错误
   * @returns {string} 脱敏后的错误信息
   */
  sanitizeErrorMessage(error) {
    const safeErrors = {
      'ER_NO_SUCH_TABLE': '表不存在',
      'ER_DUP_ENTRY': '数据重复，违反唯一性约束',
      'ER_BAD_FIELD_ERROR': '字段不存在',
      'ER_PARSE_ERROR': 'SQL语法错误',
      'ER_ACCESS_DENIED_ERROR': '数据库访问被拒绝',
      'ER_TABLE_EXISTS_ERROR': '表已存在',
      'ER_BAD_NULL_ERROR': '字段不能为空',
      'ER_DATA_TOO_LONG': '数据超出字段长度限制',
      'ER_TRUNCATED_WRONG_VALUE': '数据类型不匹配',
      'ECONNREFUSED': '数据库连接被拒绝',
      'ETIMEDOUT': '数据库连接超时',
      'PROTOCOL_CONNECTION_LOST': '数据库连接丢失'
    };

    if (error.code && safeErrors[error.code]) {
      return safeErrors[error.code];
    }

    if (error.message && error.message.includes('timeout')) {
      return '查询执行超时';
    }

    return '数据库操作失败，请稍后重试';
  }

  /**
   * 执行SQL查询
   * @param {string} sql - SQL语句
   * @param {Array} params - 查询参数
   * @returns {Object} 查询结果
   */
  async executeQuery(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    if (sql && sql.length > DatabaseManager.MAX_SQL_LENGTH) {
      return {
        success: false,
        error: `SQL语句过长，最大允许 ${DatabaseManager.MAX_SQL_LENGTH} 个字符`
      };
    }

    let connection;
    try {
      connection = await this.pool.getConnection();
      
      const startTime = Date.now();
      
      const queryPromise = connection.execute(sql, params);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('查询执行超时')), DatabaseManager.QUERY_TIMEOUT);
      });
      
      const [rows, fields] = await Promise.race([queryPromise, timeoutPromise]);
      const executionTime = Date.now() - startTime;

      const operation = this.getOperationType(sql);
      
      return {
        success: true,
        operation: operation,
        data: rows,
        fields: fields ? fields.map(f => ({
          name: f.name,
          type: f.type,
          length: f.length
        })) : [],
        rowCount: Array.isArray(rows) ? rows.length : rows.affectedRows || 0,
        executionTime: executionTime,
        insertId: rows.insertId || null
      };
    } catch (error) {
      console.error('SQL执行错误:', error.code || 'UNKNOWN');
      return {
        success: false,
        error: this.sanitizeErrorMessage(error)
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * 验证并转义表名，防止SQL注入
   * @param {string} tableName - 表名
   * @returns {string|null} 安全的表名或null
   */
  sanitizeTableName(tableName) {
    if (!tableName || typeof tableName !== 'string') {
      return null;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return null;
    }
    if (tableName.length > 64) {
      return null;
    }
    return tableName;
  }

  /**
   * 获取数据库表信息
   * @returns {Object} 表信息
   */
  async getTablesInfo() {
    try {
      const tablesResult = await this.executeQuery('SHOW TABLES');
      if (!tablesResult.success) {
        return tablesResult;
      }

      const tables = [];
      for (const row of tablesResult.data) {
        const rawTableName = Object.values(row)[0];
        const tableName = this.sanitizeTableName(rawTableName);
        
        if (!tableName) {
          console.warn('跳过无效表名:', rawTableName);
          continue;
        }
        
        const structureResult = await this.executeQuery(`DESCRIBE \`${tableName}\``);
        if (structureResult.success) {
          tables.push({
            name: tableName,
            columns: structureResult.data
          });
        }
      }

      return {
        success: true,
        data: tables
      };
    } catch (error) {
      return {
        success: false,
        error: '获取表信息时发生错误'
      };
    }
  }

  /**
   * 获取SQL操作类型（只读模式）
   * @param {string} sql - SQL语句
   * @returns {string} 操作类型
   */
  getOperationType(sql) {
    const trimmed = sql.toLowerCase().trim();
    if (trimmed.startsWith('select')) return 'SELECT';
    if (trimmed.startsWith('show')) return 'SHOW';
    if (trimmed.startsWith('describe') || trimmed.startsWith('desc ')) return 'DESCRIBE';
    if (trimmed.startsWith('explain')) return 'EXPLAIN';
    return 'UNKNOWN';
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('✓ 数据库连接已关闭');
    }
  }

  /**
   * 获取连接状态
   * @returns {boolean} 连接状态
   */
  isConnectionActive() {
    return this.isConnected;
  }
}

module.exports = DatabaseManager;