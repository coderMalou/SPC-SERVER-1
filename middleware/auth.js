const jwt = require('jsonwebtoken');// 引入 JWT 工具包，专门用来生成和验证加密令牌
const config = require('../config');

function auth(req, res, next) {
  const token = req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ code: 401, msg: '未登录或令牌无效' });
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, msg: '登录已过期或令牌无效' });
  }
}

module.exports = { auth };
