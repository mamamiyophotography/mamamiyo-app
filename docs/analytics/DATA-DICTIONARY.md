# 数据字典与漏斗定义

生产 stream 目标 G-46ZYQWWCYP，属性 ID 尚待确认。业务订单真值为 PostgreSQL，不依赖广告平台估算。匿名编号可关联订单时仍视为假名化数据，访问应受限。

| 项目 | 类型 / 含义 | 触发和防重 |
|---|---|---|
| page_view | 域名+受控路径；不含query或个人page title；referrer仅已批准origin | 同意后页面加载一次；正常刷新可再产生 pageview |
| portfolio_view | 摄影作品页面访问 | 网站明确路径，30分钟窗口内同一页去重 |
| package_view | package_type: newborn/fullmonth/baby/maternity/bundle | 网站卡片至少50%可见；App实际套餐选择；按hostname区分，不相加 |
| booking_click | 进入 App 的真实链接点击 | 网站；套餐类型或unknown；30分钟窗口去重 |
| booking_start | 已选套餐并进入日期步骤 | App；每套餐30分钟窗口去重 |
| booking_submit | API成功创建pending预约 | App；随机booking_reference去重；上传/校验失败不触发 |
| booking_confirmed | 管理员确认收到订金 | 原子事务+eventKey唯一；不是全款或支付网关成功 |
| value/currency | 确认时depositAmount/SGD | value_basis=deposit_received，其他步骤不虚构金额 |
| booking_reference | random UUID，非查单reference，非GA client ID | 订单级核对；不含客户姓名/时间/手机号 |
| analyticsAttribution | 私有JSON：consent、capturedAt、source、medium、landingPage、clientId、sessionId、test | 同意后提交，服务端白名单过滤；30分钟新鲜度检查 |
| source / medium | 受控代码，未知保持unknown | website受控UTM/已知referrer推断或AppUTM；GA原生Session source/medium单独保留，二者口径不保证完全相同 |
| clientId/sessionId | 仅从gtag get获取，格式校验 | 私有数据库用于MP关联；不是公开身份、不送user_id |
| test | true=测试/localhost/非批准production host | 浏览器测试仅本地console，服务器不入生产outbox |
| AnalyticsOutbox | 唯一eventKey、内部bookingId、safe payload、createdAt、claimedAt、deliveryStatus | pending→accepted/rejected/uncertain/expired；accepted不保证GA入库 |

campaign白名单：google,bing,instagram,facebook,tiktok,xiaohongshu,lemon,chatgpt,direct,unknown,organic,social,referral,cpc,email,none。实际营销使用其他来源时先审查并扩展受控词典，不接受姓名、自由文本 campaign 或完整 URL。

## GA4 漏斗（需在正确属性创建；当前只有定义，没有写入远端）

建立三份报表，避免把离线确认强塞进同一session：

1. Acquisition/Traffic：engaged sessions，Session source/medium，landing page。有效访问用 GA4 engaged sessions 作操作定义，不声称全部真人；默认机器人过滤、测试控制和同意偏差单列。
2. Website→App 严格顺序漏斗：有效访问 → 网站package_view → booking_click → App booking_start → booking_submit。以session归因/hostname核验前五步；另有开放漏斗显示直接进入App的人。package_type分组从套餐阶段开始，不能给从未看套餐的所有访问者硬分配套餐。
3. 订单cohort：SQL order-funnel.sql，按createdAt周、source/medium、package_type，submitted→confirmed。包括未同意/unattributed的操作订单，排除test及bundle兑换重复订单。7/14/30日成熟度另标；只有聚合结果可分享。

| 指标 | 明确分子/分母 |
|---|---|
| Packages 到达率 | 同一网站session中产生网站package_view的sessions / 有效网站sessions |
| 套餐吸引力 | 同一套餐、同一来源的 booking_click sessions / 该套餐网站package_view sessions |
| 点击→开始率 | 沿网站入口的 booking_start sessions / booking_click sessions |
| 预约流程完成率 | 有序booking_submit sessions / booking_start sessions |
| 预约成交率 | 相同创建cohort的确认订金订单数 / 成功提交订单数，来自订单台账 |
| 网站最终转化率 | 在观察期内完成确认的distinct users / 网站有效访客distinct users（采用user口径、同意子集）；若使用sessions必须单独命名为每访问确认订单数，不能混用user/session/order |
| 询盘成交率 | 真实有效询盘cohort最终成交数 / 真实收到的有效询盘数，当前未接通该台账；显示不可测，不能填0 |

GA4漏斗展示active users时所有步骤用同一用户口径，不能与session分母混算；单独Session报表按session计数。没有GA BigQuery session级导出时，不假装GA Funnel exploration是session漏斗。暂用GA原生用户漏斗并单独列流量sessions。

不能使用GA自定义source/medium覆盖原生来源归因；自定义归因仅供订单核对。超过24小时后的确认不强行接回原session，保留订单cohort来源为真值。Google Signals关闭；跨设备、拒绝cookies、广告拦截、外部WhatsApp继续聊天都可能断链。
