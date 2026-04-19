const express = require('express'); //身份认证
const jwt = require('jsonwebtoken');
const router = express.Router();
const config = require('../config');
const { fail } = require('../utils/response');

const mockUser = {
  username: 'spc_admin',
  password: '123456',
  role: 'admin'
};

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return fail(res, 400, '账号或密码不能为空');
    }
    if (username !== mockUser.username || password !== mockUser.password) {
      return fail(res, 401, '账号或密码错误');
    }
    const token = jwt.sign(
      { username: mockUser.username, role: mockUser.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    return res.status(200).json({
      code: 200,
      msg: '登录成功',
      data: { token, username: mockUser.username, role: mockUser.role }
    });
  } catch (e) {
    return fail(res, 500, '服务器内部错误', { error: e.message });
  }
});

module.exports = router;
