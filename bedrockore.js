/*
 * FKD 基岩版矿物查找器 · 精确坐标内核（v1.9.13）
 * -----------------------------------------------------------
 * 内核逆向自 minecraftsearch.com（基岩版 BDS 1.26.51.1 矿石设置），与作者 Python 内核、原站 wasm 三方一致。
 * 关键修正（相对 v1.9.12）：特性种子生成器由错误公式(SplitMix64)更换为精确复刻原站 wasm func 271
 *   （B/A 由种子低32位派生 MT19937 输出，黄金比常量 1640531527）—— 旧版给的 X/Z 坐标是假的，仅 Y 分布形状碰巧相似。
 * 矿石参数表已按原站权威值修正（铁最佳Y 232→16、煤 227→96、远古残骸 16→15 等）。
 * 支持：主世界 + 下界；不含末地；不适用 Java 版（Java 用 Xoroshiro128++，本内核为 MT19937）。
 * 基岩层(-64~-60)已剔除，深部矿石峰值上移（如钻石 Y=-59）。
 */
(function () {
/* ===== 矿石规则表 ===== */
const 矿石规则表 = {"26.50":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"26.30":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"26.23":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"26.0":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.21.120":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.21.90":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.21.60":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.21.50":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.21.0":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.20.60":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.20.1":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.19":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}},"1.18":{"coal":{"disp":"煤炭","dim":0,"step":6,"av":88,"al":40,"best":96,"band":[0,319],"batches":[{"n":"coal_upper","it":30,"c":17,"d":0.0,"yt":"uniform","lo":136,"hi":319,"bg":1,"bgates":null},{"n":"coal_lower","it":20,"c":17,"d":0.5,"yt":"trap","lo":0,"hi":192,"bg":1,"bgates":null}]},"iron":{"disp":"铁","dim":0,"step":6,"av":94,"al":94,"best":16,"band":[-59,319],"batches":[{"n":"iron_upper","it":90,"c":9,"d":0.0,"yt":"trap","lo":80,"hi":384,"bg":1,"bgates":null},{"n":"iron_middle","it":10,"c":9,"d":0.0,"yt":"trap","lo":-24,"hi":56,"bg":1,"bgates":null},{"n":"iron_small","it":10,"c":4,"d":0.0,"yt":"uniform","lo":-64,"hi":72,"bg":1,"bgates":null}]},"copper":{"disp":"铜","dim":0,"step":6,"av":94,"al":93,"best":48,"band":[-16,112],"batches":[{"n":"copper","it":16,"c":10,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[0,1,2,3,4,5,6,7,10,11,12,14,16,21,23,24,25,26,27,29,30,32,34,35,36,37,38,44,45,46,48,49,50,129,131,132,140,155,160,163,165,168,175,177,178,179,180,181,182,183,184,185,186]},{"n":"copper_large","it":16,"c":20,"d":0.0,"yt":"trap","lo":-16,"hi":112,"bg":1,"bgates":[174]}]},"gold":{"disp":"金","dim":0,"step":6,"av":85,"al":83,"best":-16,"band":[-59,32],"batches":[{"n":"gold","it":4,"c":9,"d":0.5,"yt":"trap","lo":-64,"hi":32,"bg":1,"bgates":null},{"n":"gold_lower","it":1,"c":9,"d":0.5,"yt":"uniform","lo":-64,"hi":-48,"bg":0,"bgates":null}]},"redstone":{"disp":"红石","dim":0,"step":6,"av":86,"al":85,"best":-59,"band":[-59,15],"batches":[{"n":"redstone","it":4,"c":8,"d":0.0,"yt":"uniform","lo":-64,"hi":15,"bg":1,"bgates":null},{"n":"redstone_lower","it":8,"c":8,"d":0.0,"yt":"trap","lo":-96,"hi":-32,"bg":0,"bgates":null}]},"diamond":{"disp":"钻石","dim":0,"step":6,"av":91,"al":80,"best":-59,"band":[-59,16],"batches":[{"n":"diamond_buried","it":4,"c":8,"d":1.0,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond","it":7,"c":4,"d":0.5,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null},{"n":"diamond_large","it":1,"c":12,"d":0.7,"yt":"triangle","lo":-144,"hi":16,"bg":0,"bgates":null}]},"lapis":{"disp":"青金石","dim":0,"step":6,"av":93,"al":96,"best":0,"band":[-59,64],"batches":[{"n":"lapis","it":2,"c":7,"d":0.0,"yt":"trap","lo":-32,"hi":32,"bg":1,"bgates":null},{"n":"lapis_buried","it":4,"c":7,"d":1.0,"yt":"uniform","lo":-64,"hi":64,"bg":1,"bgates":null}]},"emerald":{"disp":"绿宝石","dim":0,"step":6,"av":88,"al":88,"best":232,"band":[-16,319],"batches":[{"n":"emerald","it":100,"c":3,"d":0.0,"yt":"trap","lo":-16,"hi":480,"bg":1,"bgates":[178,179,180,181,182,177,185,3,34,131]}]},"netherite":{"disp":"远古残骸","dim":-1,"step":7,"av":91,"al":91,"best":15,"band":[8,119],"batches":[{"n":"ancient_debris","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":24,"bg":0,"bgates":null},{"n":"ancient_debris_large","it":1,"c":3,"d":0.0,"yt":"triangle","lo":8,"hi":119,"bg":0,"bgates":null}]},"nether_gold":{"disp":"下界金矿","dim":-1,"step":7,"av":85,"al":85,"best":63,"band":[10,117],"batches":[{"n":"nether_gold","it":10,"c":10,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]},"nether_quartz":{"disp":"下界石英","dim":-1,"step":7,"av":83,"al":83,"best":63,"band":[10,117],"batches":[{"n":"nether_quartz","it":16,"c":14,"d":0.0,"yt":"uniform","lo":10,"hi":117,"bg":0,"bgates":null}]}}}

/* ===== 矿石颜色 ===== */
const 矿石颜色 = {
  diamond:"#5dced1", iron:"#c0c0c0", copper:"#e08040", gold:"#ffd700",
  redstone:"#ff5555", lapis:"#4a6fd4", emerald:"#3ddc84", coal:"#6b6b6b",
  netherite:"#8b3a3a", nether_gold:"#ffcf5c", nether_quartz:"#e8e0d0"
}

/* ===== 世界 ===== */
const 世界 = { 最低:-64, 最高:319, 基岩顶:-59 }

/* ===== 下界 ===== */
const 下界 = { 最低:0, 最高:127 }

/* ===== 可开采 ===== */
function 可开采(y, 维度){
  if(维度 === -1) return y >= 下界.最低 && y <= 下界.最高;
  return y >= 世界.基岩顶 && y <= 世界.最高;
}

/* ===== 钳到可采 ===== */
function 钳到可采(y, 维度){
  if(维度 === -1) return Math.max(下界.最低, Math.min(下界.最高, y));
  return Math.max(世界.基岩顶, Math.min(世界.最高, y));
}

/* ===== 梅森旋转 ===== */
class 梅森旋转{
  constructor(种子){
    this.mt = new Int32Array(624); this.mti = 624;
    this.mt[0] = 种子 >>> 0;
    for(let i = 1; i < 624; i++){
      const 前 = this.mt[i-1];
      this.mt[i] = (Math.imul(1812433253, (前 ^ (前 >>> 30))) + i) | 0;
    }
  }
  _生成(){
    for(let i = 0; i < 624; i++){
      const y = (this.mt[i] & 0x80000000) | (this.mt[(i+1) % 624] & 0x7fffffff);
      let v = this.mt[(i + 397) % 624] ^ (y >>> 1);
      if(y & 1) v ^= 0x9908b0df;
      this.mt[i] = v | 0;
    }
  }
  取无符号(){
    if(this.mti >= 624){ this._生成(); this.mti = 0; }
    let y = this.mt[this.mti++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  取浮点(){ return (this.取无符号() >>> 8) / 16777216; }
  取整数(上界){ return this.取无符号() % 上界; }
}

/* ===== 特性种子 ===== */
function 特性种子(世界种子, 区块X, 区块Z, 盐){
  const g = 世界种子 >>> 0;                          // 只用种子低 32 位
  const m = new 梅森旋转(g);
  const B = ((m.取无符号() >>> 1) | 1) >>> 0;
  const A = ((m.取无符号() >>> 1) | 1) >>> 0;
  const x = ((g ^ ((((区块Z * A) | 0) >>> 0) + (((区块X * B) | 0) >>> 0))) >>> 0) | 0;
  const xu = x >>> 0;
  const 内 = (((((xu << 6) >>> 0) + (xu >>> 2)) >>> 0) + 区块种子常量_S - 区块种子常量_黄金比) >>> 0;
  return (xu ^ 内) | 0;
}

/* ===== 采样高度 ===== */
function 采样高度(随机, 规格, 维度){
  const 低 = 规格.lo, 高 = 规格.hi, 跨度 = 高 - 低;
  if(跨度 <= 0) return 可开采(低, 维度) ? 低 : null;
  let y;
  if(规格.yt === "triangle" || 规格.yt === "trap"){
    y = 低 + Math.floor(((随机.取浮点() + 随机.取浮点()) / 2) * 跨度);
  }else{
    y = 低 + Math.floor(随机.取浮点() * 跨度);
  }
  if(!可开采(y, 维度)) return null;   // 落在基岩层：整簇不生成
  return y;
}

/* ===== 矿点权重 ===== */
function 矿点权重(批次, 维度, 地表){
  // 高度门控：地表太低，整批不生成
  if(批次.bg && 地表 + 4 < Math.min(批次.lo, 批次.hi)) return 0;
  return 批次.c * (1 - 批次.d);
}

/* ===== 扫描区块 ===== */
function 扫描区块(规则, 世界种子, 区块X, 区块Z, 维度, 地表, 生物群系){
  const 结果 = [];
  const 随机 = new 梅森旋转(特性种子(世界种子, 区块X, 区块Z, 规则.step));
  for(const 批次 of 规则.batches){
    // 生物群系门控
    if(批次.bgates){
      if(生物群系 === null){
        if(批次.bgates.length / 60 < 0.02) continue;
      }else if(!批次.bgates.includes(生物群系)) continue;
    }
    const 权重 = 矿点权重(批次, 维度, 地表);
    if(权重 <= 0) continue;
    const 规格 = { yt:批次.yt, lo:批次.lo, hi:批次.hi };
    for(let k = 0; k < 批次.it; k++){
      const y = 采样高度(随机, 规格, 维度);
      const bx = 区块X * 16 + 随机.取整数(16);
      const bz = 区块Z * 16 + 随机.取整数(16);
      if(y === null) continue;            // 落在基岩层，整簇不生成
      结果.push({ x:bx, y:y, z:bz, 区块X:区块X, 区块Z:区块Z,
                  批次:批次.n, 矿团:批次.c, 权重:权重 });
    }
  }
  return 结果;
}

/* ===== 查找矿点 ===== */
function 查找矿点(规则, 世界种子, 中心X, 中心Z, 半径区块, 维度, 地表, 生物群系){
  const 全部 = [];
  const 中心区块X = 中心X >> 4, 中心区块Z = 中心Z >> 4;
  for(let cz = 中心区块Z - 半径区块; cz <= 中心区块Z + 半径区块; cz++){
    for(let cx = 中心区块X - 半径区块; cx <= 中心区块X + 半径区块; cx++){
      const 本区 = 扫描区块(规则, 世界种子, cx, cz, 维度, 地表, 生物群系);
      for(const s of 本区){
        s.距离 = Math.hypot(s.x - 中心X, s.z - 中心Z);
        全部.push(s);
      }
    }
  }
  全部.sort((a, b) => a.距离 - b.距离);
  return 全部;
}

/* ===== 批次中文名 ===== */
const 批次中文名 = {
  coal_upper:"煤炭·上层", coal_lower:"煤炭·下层",
  iron_upper:"铁·上层", iron_middle:"铁·中层", iron_small:"铁·小簇",
  copper:"铜·普通", copper_large:"铜·大簇",
  gold:"金·普通", gold_lower:"金·深层",
  redstone:"红石·普通", redstone_lower:"红石·深层",
  diamond_buried:"钻石·深埋", diamond:"钻石·普通", diamond_large:"钻石·大簇",
  lapis:"青金石·普通", lapis_buried:"青金石·深埋",
  emerald:"绿宝石",
  ancient_debris:"远古残骸", ancient_debris_large:"远古残骸·大簇",
  nether_gold:"下界金矿", nether_quartz:"下界石英"
}

/* ===== 批次名 ===== */
function 批次名(标识){ return 批次中文名[标识] || 标识.replace(/_/g, " "); }

/* ===== 解析种子 ===== */
function 解析种子(文本){
  文本 = (文本 || "").trim();
  if(!文本) return 0;
  if(/^-?\d+$/.test(文本)){
    const 大数 = BigInt(文本);
    return Number(BigInt.asIntN(64, 大数) & 0x7FFFFFFFn);
  }
  let 哈希 = 0;
  for(let i = 0; i < 文本.length; i++){
    哈希 = (Math.imul(31, 哈希) + 文本.charCodeAt(i)) | 0;
  }
  return 哈希;
}

/* ===== 区块种子常量_S ===== */
const 区块种子常量_S = 2216829733;

/* ===== 区块种子常量_黄金比 ===== */
const 区块种子常量_黄金比 = 1640531527;


/* ============================ FKD 包装层（API + 渲染） ============================ */

// 矿石配色（与项目像素风协调）
const ORECOLOR = {
	coal: '#6a6a6a', iron: '#c8a884', copper: '#d98c4a', gold: '#e6c34a',
	redstone: '#d63a3a', diamond: '#5ad6e6', lapis: '#3a5ad6', emerald: '#3ad67a',
	netherite: '#8a6d5a', nether_gold: '#ffcf5c', nether_quartz: '#e8e0d0'
};
const 版本顺序 = ['26.50', '26.30', '26.23', '26.0', '1.21.120', '1.21.90', '1.21.60', '1.21.50', '1.21.0', '1.20.60', '1.20.1', '1.19', '1.18'].filter(v => 矿石规则表[v]);

function 取颜色(k) { return ORECOLOR[k] || '#8a8a8a'; }

// 某版本 + 维度下的矿石列表
function 矿石列表(版本, 维度) {
	const 集 = 矿石规则表[版本] || {};
	return Object.keys(集).filter(k => 集[k].dim === 维度)
		.map(k => ({ key: k, disp: 集[k].disp, av: 集[k].av, best: 集[k].best, band: 集[k].band }));
}

// 主入口：返回带精确坐标的矿点数组
function findOres(opt) {
	opt = opt || {};
	const 版本 = 矿石规则表[opt.version] ? opt.version : 版本顺序[0];
	const 维度 = (opt.dim === -1) ? -1 : 0;
	const 集 = 矿石规则表[版本] || {};
	let key = opt.oreKey;
	if (!集[key] || 集[key].dim !== 维度) key = Object.keys(集).find(k => 集[k].dim === 维度);
	const 规则 = 集[key];
	if (!规则) return null;
	const 种子 = 解析种子(opt.seedText);
	const 中心X = Math.floor(Number(opt.centerX) || 0);
	const 中心Z = Math.floor(Number(opt.centerZ) || 0);
	const 半径 = Math.max(2, Math.min(40, parseInt(opt.radius, 10) || 10));
	const 地表 = parseInt(opt.surface, 10) || 64;
	const 点 = 查找矿点(规则, 种子, 中心X, 中心Z, 半径, 维度, 地表, null) || [];

	// 求 Y 范围后自适应分桶（深部矿石步进 4，宽范围矿石步进更大）
	let minY = Infinity, maxY = -Infinity;
	for (const p of 点) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
	if (!点.length) { minY = 规则.band[0]; maxY = 规则.band[1]; }
	const span = (maxY - minY) || 1;
	const step = span > 160 ? 20 : span > 80 ? 10 : 4;
	const hist = {};
	for (const p of 点) { const b = Math.floor(p.y / step) * step; hist[b] = (hist[b] || 0) + 1; }

	return { version: 版本, dim: 维度, oreKey: key, rule: 规则, seed: 种子, centerX: 中心X, centerZ: 中心Z,
		radius: 半径, surface: 地表, points: 点, hist, step, minY, maxY, color: 取颜色(key) };
}

// 渲染结果到容器
function renderResult(containerId, data) {
	const el = document.getElementById(containerId);
	if (!el || !data) return;
	el.style.display = 'block';
	const o = data.rule;
	const 维名 = data.dim === -1 ? '下界' : '主世界';
	const 总 = data.points.length;

	// 「标记已挖掘」状态：按 种子+版本+维度+矿石 独立存 localStorage
	const mk = 'fkd_ore_mined__' + data.seed + '_' + data.version + '_' + data.dim + '_' + data.oreKey;
	const 读标记 = () => { try { return new Set(JSON.parse(localStorage.getItem(mk) || '[]')); } catch (e) { return new Set(); } };
	const 写标记 = s => { try { localStorage.setItem(mk, JSON.stringify([...s])); } catch (e) {} };
	let 已挖集 = 读标记();

	// Y 层柱状分布（从高 Y 到低 Y）
	const 桶 = Object.keys(data.hist).map(Number).sort((a, b) => b - a);
	const 最大 = Math.max(1, ...桶.map(k => data.hist[k]));
	const bars = 桶.map(k => {
		const w = Math.round(data.hist[k] / 最大 * 100);
		const 近峰 = k <= o.best + data.step && k >= o.best - data.step;
		return '<div class="oy-bar-row"><span class="oy-bar-y">' + k + '</span><span class="oy-bar-track"><span class="oy-bar-fill' + (近峰 ? ' peak' : '') + '" style="width:' + w + '%;' + (近峰 ? 'background:' + data.color : '') + '"></span></span><span class="oy-bar-n">' + data.hist[k] + '</span></div>';
	}).join('');

	// 精确矿点列表（前 120，可标记已挖）
	const shown = data.points.slice(0, 120);
	const rows = shown.map((p, i) => {
		const t = p.x + ' ' + p.y + ' ' + p.z;
		const mid = 已挖集.has(t);
		return '<div class="ore-pt' + (mid ? ' mined' : '') + '" data-copy="' + t + '">' +
			'<span class="ore-idx">' + (i + 1) + '</span>' +
			'<span class="ore-xyz">' + t + '</span>' +
			'<span class="ore-chunk">区块(' + p.区块X + ',' + p.区块Z + ')</span>' +
			'<span class="ore-dist">' + Math.round(p.距离) + '格</span>' +
			'<button class="ore-mine-btn' + (mid ? ' on' : '') + '" data-coord="' + t + '">' + (mid ? '已挖' : '标记已挖') + '</button>' +
			'</div>';
	}).join('');

	const 进度文本 = 总 ? (已挖集.size + '/' + 总 + ' · ' + Math.round(已挖集.size / 总 * 100) + '%') : '无矿点';

	el.innerHTML =
		'<div class="ore-result-head">' +
			'<span class="ore-badge" style="background:' + data.color + '"></span>' +
			'<strong>' + o.disp + '</strong>' +
			'<span class="ore-dim">· ' + 维名 + ' · 基岩版 ' + data.version + '</span>' +
			'<span class="ore-seed">种子 ' + data.seed + '</span>' +
		'</div>' +
		'<div class="ore-ylevel">' +
			'<div class="oy-row"><span class="oy-label">推荐挖掘 Y 层</span><span class="oy-val">' + o.best + '</span></div>' +
			'<div class="oy-sub">生成范围 ' + o.band[0] + ' ~ ' + o.band[1] + ' · 精度 ' + o.av + '% · 半径 ' + data.radius + ' 区块 · 中心 (' + data.centerX + ', ' + data.centerZ + ') · 共 ' + 总 + ' 个矿点</div>' +
		'</div>' +
		'<div class="ore-progress">采矿进度：<b>' + 进度文本 + '</b> <button class="ore-clear-btn" id="oreClearBtn">清空当前矿石标记</button></div>' +
		'<div class="ore-dist-wrap">' +
			'<div class="oy-hist-title">Y 层矿点分布（柱长=该层矿点数，高亮为推荐层附近）</div>' +
			(bars || '<div class="oy-empty">该区域无矿点</div>') +
		'</div>' +
		'<div class="ore-list">' +
			'<div class="ore-list-title">精确矿点坐标（按距离排序 · 点击复制 → 游戏内定位 · 可标记已挖）</div>' +
			(rows || '<div class="ore-more">该半径内未找到矿点，试试加大半径</div>') +
			(data.points.length > 120 ? '<div class="ore-more">…共 ' + 总 + ' 个，仅显示最近 120 个</div>' : '') +
		'</div>' +
		'<div class="ore-disclaimer">' +
			'<b>基岩版内核 v1.9.13</b>：特性种子算法已修正为精确复刻原站 wasm（之前 v1.9.12 的坐标有误，已作废）。逆向自 BDS 1.26.51.1 矿石设置，与作者 Python 内核、原站 wasm 三方一致。' +
			'支持 <b>主世界 + 下界</b>，<b>不含末地</b>；<b>不适用 Java 版</b>。矿点为概率候选（精度见上），请以<b>游戏内实际挖掘</b>为准。' +
		'</div>';

	// 点击复制坐标（避开标记按钮）
	el.querySelectorAll('.ore-pt').forEach(r => {
		r.addEventListener('click', e => {
			if (e.target.classList.contains('ore-mine-btn')) return;
			const t = r.dataset.copy;
			const done = () => { r.classList.add('copied'); setTimeout(() => r.classList.remove('copied'), 900); };
			if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, done); }
			else { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) {} }
		});
	});
	// 标记已挖掘 切换
	el.querySelectorAll('.ore-mine-btn').forEach(b => {
		b.addEventListener('click', e => {
			e.stopPropagation();
			const t = b.dataset.coord;
			if (已挖集.has(t)) 已挖集.delete(t); else 已挖集.add(t);
			写标记(已挖集);
			renderResult(containerId, data);
		});
	});
	// 清空当前矿石标记
	const clr = el.querySelector('#oreClearBtn');
	if (clr) clr.addEventListener('click', () => { 已挖集 = new Set(); 写标记(已挖集); renderResult(containerId, data); });
}


window.FKDBedrockOre = { findOres, renderResult, 版本顺序, 取颜色, 矿石列表, 解析种子, 矿石规则表 };
})();
