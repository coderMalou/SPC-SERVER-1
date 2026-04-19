function ok(res, data = null, msg = '成功') {
  return res.status(200).json({ code: 200, msg, data });
}
function fail(res, code = 400, msg = '请求错误', extra = {}) {
  const status = (code >= 400 && code < 600) ? code : 400;
  return res.status(status).json({ code, msg, ...extra });
}
module.exports = { ok, fail };
