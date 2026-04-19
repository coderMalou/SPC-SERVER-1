/**
 * 轻量 SPC 后端配置
 */
module.exports = {
  port: process.env.PORT || 3456,
  jwt: {
    secret: process.env.JWT_SECRET || 'spc_secret_2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h'
  },
  db: {
    path: process.env.DB_PATH || './data/spc.db'
  }
};
