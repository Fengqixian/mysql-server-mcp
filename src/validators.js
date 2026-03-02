/**
 * SQL验证器
 * 提供SQL语句的安全性验证功能
 */

class SQLValidator {
    constructor() {
      // 只允许SELECT查询操作（只读模式）
      this.allowedOperations = ['select', 'show', 'describe', 'explain'];
      
      this.dangerousPatterns = [
        /\bdrop\s+(table|database|index|user|view|trigger|procedure|function)/i,
        /\btruncate\s+(table)?/i,
        /\balter\s+(table|database|user|view)/i,
        /\bcreate\s+(database|user|table|index|view|trigger|procedure|function)/i,
        /\brename\s+(table|database)/i,
        /\bgrant\b/i,
        /\brevoke\b/i,
        /\bload_file\s*\(/i,
        /\binto\s+(outfile|dumpfile)/i,
        /\bexec(ute)?\s*\(/i,
        /\bsp_/i,
        /\bxp_/i,
        /\bshutdown\b/i,
        /\bkill\b/i,
        /\bflush\b/i,
        /\bpurge\b/i,
        /\breset\b/i,
        /\bset\s+(global|session|password)/i,
        /\bshow\s+(grants|privileges)/i,
        /\bbenchmark\s*\(/i,
        /\bsleep\s*\(/i,
        /\bwaitfor\b/i,
        /\bpg_sleep\s*\(/i,
      ];

      this.injectionPatterns = [
        /union\s+(all\s+)?select/i,
        /;\s*(drop|delete|update|insert|alter|create|truncate|grant|revoke)/i,
        /--\s*$/,
        /--\s+/,
        /#\s*$/,
        /\/\*[\s\S]*?\*\//,
        /'\s*or\s+['"0-9]/i,
        /"\s*or\s+['"0-9]/i,
        /'\s*and\s+['"0-9]/i,
        /"\s*and\s+['"0-9]/i,
        /'\s*=\s*'/,
        /"\s*=\s*"/,
        /\bor\s+1\s*=\s*1/i,
        /\band\s+1\s*=\s*1/i,
        /\bor\s+'[^']*'\s*=\s*'[^']*'/i,
        /\bor\s+"[^"]*"\s*=\s*"[^"]*"/i,
        /0x[0-9a-fA-F]+/,
        /char\s*\(\s*\d+/i,
        /concat\s*\([^)]*select/i,
        /group_concat\s*\(/i,
        /information_schema/i,
        /mysql\s*\.\s*(user|db)/i,
        /@@(version|datadir|basedir|hostname)/i,
      ];
    }

    /**
     * 移除SQL注释和多余空白，标准化SQL用于检测
     * @param {string} sql - SQL语句
     * @returns {string} 标准化后的SQL
     */
    normalizeSQL(sql) {
      let normalized = sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--.*$/gm, ' ')
        .replace(/#.*$/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return normalized;
    }
  
    /**
     * 验证SQL语句的安全性
     * @param {string} sql - 要验证的SQL语句
     * @returns {Object} 验证结果
     */
    validateSQL(sql) {
      if (!sql || typeof sql !== 'string') {
        return {
          isValid: false,
          error: 'SQL语句不能为空且必须是字符串'
        };
      }

      if (sql.length > 10000) {
        return {
          isValid: false,
          error: 'SQL语句过长'
        };
      }
  
      const normalizedSQL = this.normalizeSQL(sql);
      
      for (const pattern of this.dangerousPatterns) {
        if (pattern.test(sql) || pattern.test(normalizedSQL)) {
          return {
            isValid: false,
            error: '检测到危险操作，该SQL语句不被允许'
          };
        }
      }
  
      const operation = this.getOperationType(normalizedSQL);
      if (!this.allowedOperations.includes(operation)) {
        return {
          isValid: false,
          error: `不支持的操作类型，仅允许: ${this.allowedOperations.join(', ')}`
        };
      }
  
      const injectionCheck = this.checkSQLInjection(sql, normalizedSQL);
      if (!injectionCheck.isValid) {
        return injectionCheck;
      }
  
      return {
        isValid: true,
        operation: operation
      };
    }
  
    /**
     * 获取SQL操作类型
     * @param {string} sql - SQL语句
     * @returns {string} 操作类型
     */
    getOperationType(sql) {
      const trimmed = sql.trim();
      if (trimmed.startsWith('select')) return 'select';
      if (trimmed.startsWith('show')) return 'show';
      if (trimmed.startsWith('describe') || trimmed.startsWith('desc ')) return 'describe';
      if (trimmed.startsWith('explain')) return 'explain';
      // 写操作一律返回unknown，将被拒绝
      if (trimmed.startsWith('insert')) return 'insert';
      if (trimmed.startsWith('update')) return 'update';
      if (trimmed.startsWith('delete')) return 'delete';
      return 'unknown';
    }
  
    /**
     * 检查SQL注入风险
     * @param {string} originalSQL - 原始SQL语句
     * @param {string} normalizedSQL - 标准化后的SQL
     * @returns {Object} 检查结果
     */
    checkSQLInjection(originalSQL, normalizedSQL) {
      for (const pattern of this.injectionPatterns) {
        if (pattern.test(originalSQL) || pattern.test(normalizedSQL)) {
          return {
            isValid: false,
            error: '检测到潜在的SQL注入风险'
          };
        }
      }
  
      return { isValid: true };
    }
  
    /**
     * 验证查询参数
     * @param {Array} params - 查询参数
     * @returns {Object} 验证结果
     */
    validateParams(params) {
      if (!Array.isArray(params)) {
        return {
          isValid: false,
          error: '参数必须是数组格式'
        };
      }
  
      if (params.length > 100) {
        return {
          isValid: false,
          error: '参数数量不能超过100个'
        };
      }

      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const type = typeof param;
        
        if (param !== null && !['string', 'number', 'boolean'].includes(type)) {
          return {
            isValid: false,
            error: `参数 ${i + 1} 类型无效，仅支持 string、number、boolean 或 null`
          };
        }

        if (type === 'string' && param.length > 65535) {
          return {
            isValid: false,
            error: `参数 ${i + 1} 长度超出限制`
          };
        }
      }
  
      return { isValid: true };
    }
  }
  
  module.exports = SQLValidator;