# 转化追踪交付记录

验收日期：2026-10-04，新加坡时间。生产迁移、部署、Squarespace 单一标签切换和 GA4 配置已完成。详细验收见 PRODUCTION-STATUS.md。

## 已上线

- GA4 属性：Mamamiyo Photography，账户 271826890，属性 381340771；数据流 Mamamiyo Website，5340766757；标签 G-46ZYQWWCYP。
- 正式预约入口：https://book.mamamiyo-photography.com/book。官网五个套餐按钮直接进入预约并预选对应套餐。
- 网站与预约页分别询问可选分析同意，拒绝仍可预约。查询页、管理页及相册页不加载预约分析标签。事件不携带客户姓名、联系方式、地址、照片或备注。
- 用户批准的完整数据库备份已加密并用 Windows DPAPI 保护密钥。已应用审核后的新增归因字段/队列表 SQL，预约数量不变。备份和环境文件排除版本控制、部署上传。
- GA4 跨域精确域名已保存：官网根域名、www、book 和现有 mamamiyo-app.vercel.app。官方 _gl 已观察到；网站与 App client ID 的 SHA-256 校验相同。未手工传递 client ID。
- 增强型自动衡量关闭；邮箱及十个敏感查询参数遮蔽开启。booking_confirmed 为关键事件、每事件一次计数、采用事件实际金额，不设置默认金额。
- 五个事件级维度：package_type、source、medium、landing_page、value_basis。booking_reference 未登记报表维度，避免高基数。
- 用户确认 GA 数据收集声明后，创建预约确认专用服务器凭据并存入 Vercel 私密配置；从未加入浏览器代码。服务器发送开关已开启。
- 管理员确认收到订金后，确认与唯一队列事件在同一事务完成，响应后发送。每日受保护任务处理遗漏队列并清理90天前归因数据；不确定发送不盲目重试。
- GA4 实际用户/事件保留期为14个月，隐私说明如实披露。90天期限只针对 App 分析归因和投递记录；常规预约记录采用单独业务政策。

## 验证结果

- 页面、套餐、官网预约点击及预约开始在 DebugView 真实收到。
- 服务器确认事件严格格式校验零错误，并用 gtag.js 建立的合成客户端发送；DebugView 已收到 booking_confirmed、newborn、synthetic_test。测试金额为零。
- 开发者流量排除已 Active，debug_mode 测试数据不计入正式报表。analytics_test=1 仍为本地控制台模式，不发往 Google；analytics_debug=1 才是 DebugView 验证模式，订单归因同时标为测试。
- 未创建生产测试预约、未付款、未发送客户邮件/WhatsApp。预约提交及真实订金确认的业务路径以隔离 mock 测试验证；首笔真实同意预约后的业务对账仍需跟进。
- 分析隐私/去重/测试抑制验证通过；现有业务 verify 全部通过；Vercel 构建部署成功。现有 Next 配置跳过全量类型检查，先前 tsc 有历史无关错误。

## 业务口径与限制

booking_submit 代表成功创建 pending 预约；booking_confirmed 代表管理员确认收到订金，金额为 deposit_received，不代表套餐全款或自动支付成功。PayNow 没有自动支付网关回调。

拒绝同意的订单仍保留在业务台账，但不会发送 GA4，不能用 GA4 总量代替全部实际订单。来源未知保留 unknown；自定义归因与 GA 原生 session source/medium 口径不同。

Google 已发送数据的删除仍需管理员流程。撤回清理当前浏览器已记录订单的 App 私有归因；跨设备请求需联系工作室。平台运行日志不在本次归因数据库审计范围内。

报表维度登记后需等待数据处理，不能补回历史漏记数据。每日 cron 已部署；本机没有现有 CRON_SECRET，未手工调用生产维护任务。
