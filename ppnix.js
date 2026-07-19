// PPnix 完全重写版 v2 - 适配 ppnix.com 实际网站结构
// 网站: https://www.ppnix.com
// 修复了原脚本的以下问题:
// 1. url 使用 fyclass 动态切换分类 (电影/电视剧)
// 2. 列表选择器使用实际 DOM 结构: .lists-content ul li
// 3. 详情页正确提取 infoid + m3u8 数组构造播放链接
// 4. 搜索 URL 格式修正
// 5. 分页偏移修正 (offset = page - 1)

var rule = {
    title: 'PPnix',
    host: 'https://www.ppnix.com',
    // 使用 fyclass 动态切换分类, fyfilter 传递筛选参数
    url: '/fyclass/fyfilter.html',
    filter_url: '{{fl.类型}}-{{fl.地区}}-{{fl.年份}}-{{fl.页偏移}}-{{fl.排序}}',
    filter_def: {
        movie: { 类型: '', 地区: '', 年份: '', 页偏移: '', 排序: 'newstime' },
        tv:    { 类型: '', 地区: '', 年份: '', 页偏移: '', 排序: 'newstime' }
    },
    // 搜索: 实际 offset = fypage - 1
    searchUrl: '/search/**-fypage-.html',
    searchable: 2,
    quickSearch: 0,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Referer': 'https://www.ppnix.com/'
    },
    timeout: 15000,
    class_name: '电影&电视剧',
    class_url: 'movie&tv',
    detailUrl: '',
    limit: 6,
    play_parse: true,
    lazy: $js.toString(() => {
        // m3u8 直链直接播放, 其他用解析
        if (input && input.indexOf('.m3u8') > 0) {
            input = { parse: 0, url: input, header: rule.headers };
        } else {
            input = { parse: 1, url: input, header: rule.headers };
        }
    }),

    // === 首页推荐: 取最新电影列表 ===
    推荐: $js.toString(() => {
        let d = [];
        let url = rule.host + '/movie/----newstime.html';
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });
        let list = pdfa(html, '.lists-content ul li');
        if (!list || list.length === 0) list = pdfa(html, 'ul li');
        // 取前20个
        let count = 0;
        list.forEach(it => {
            if (count >= 20) return;
            let href = pdfh(it, 'h2 a && href') || '';
            let name = (pdfh(it, 'h2 a && title') || pdfh(it, 'h2 a && Text') || '').trim();
            let img = pdfh(it, 'a.thumbnail img && src') || pdfh(it, 'img && src') || '';
            let remark = (pdfh(it, '.countrie span && Text') || pdfh(it, '.rate && Text') || '').trim();
            if (!href || !name) return;
            if (href.startsWith('//')) href = 'https:' + href;
            else if (href.startsWith('/')) href = rule.host + href;
            if (img && img.startsWith('//')) img = 'https:' + img;
            else if (img && img.startsWith('/')) img = rule.host + img;
            d.push({
                vod_id: href,
                vod_name: name,
                vod_pic: img,
                vod_remarks: remark
            });
            count++;
        });
        VODS = d;
    }),

    // === 一级分类列表 ===
    一级: $js.toString(() => {
        let d = [];
        let page = MY_PAGE || 1;

        // 设置页偏移: offset = page - 1
        if (rule.filter_def) {
            Object.keys(rule.filter_def).forEach(cate => {
                rule.filter_def[cate].页偏移 = page > 1 ? String(page - 1) : '';
            });
        }

        let url = input;
        if (url.startsWith('/')) url = rule.host + url;

        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        // 列表选择器: .lists-content ul li (实际页面无class, 但此选择器能匹配)
        let list = pdfa(html, '.lists-content ul li');
        if (!list || list.length === 0) {
            list = pdfa(html, 'ul li');
        }

        list.forEach(it => {
            let href = pdfh(it, 'h2 a && href') || '';
            let name = (pdfh(it, 'h2 a && title') || pdfh(it, 'h2 a && Text') || '').trim();
            let img = pdfh(it, 'a.thumbnail img && src') || pdfh(it, 'img && src') || '';
            let remark = (pdfh(it, '.countrie span && Text') || pdfh(it, '.rate && Text') || '').trim();

            if (!href || !name) return;

            if (href.startsWith('//')) href = 'https:' + href;
            else if (href.startsWith('/')) href = rule.host + href;

            if (img && img.startsWith('//')) img = 'https:' + img;
            else if (img && img.startsWith('/')) img = rule.host + img;

            d.push({
                vod_id: href,
                vod_name: name,
                vod_pic: img,
                vod_remarks: remark
            });
        });

        // 分页解析: .pagination ul li a
        // 实际URL: /movie/---1-newstime.html  (offset=1 表示第2页)
        // offset 从0开始, 所以第 n 页的 offset = n-1
        let pageHtml = pdfh(html, '.pagination && Html') || '';
        let pageCount = page;
        if (pageHtml) {
            // 匹配 href="/movie/---N-newstime.html" 中的 N
            let pageMatches = [...pageHtml.matchAll(/href="[^"]*?-(\d+)-[^"]*\.html/g)];
            if (pageMatches.length > 0) {
                let maxOffset = Math.max(...pageMatches.map(m => Number(m[1])));
                pageCount = maxOffset + 1; // offset 转页码
            }
        }
        if (pageCount === page && d.length >= 24) {
            pageCount = page + 1;
        }

        VODS = d;
        setPage(page, pageCount);
    }),

    // === 二级详情页 ===
    二级: $js.toString(() => {
        let url = input;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        // 标题: h1.product-title
        let title = (pdfh(html, 'h1.product-title && Text') || pdfh(html, 'h1 && Text') || '').trim();
        let nameNoYear = title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
        let yearMatch = title.match(/\((\d{4})\)/);
        let year = yearMatch ? yearMatch[1] : '';

        // 封面: img.thumb
        let cover = pdfh(html, 'img.thumb && src') || '';
        if (cover && cover.startsWith('//')) cover = 'https:' + cover;
        else if (cover && cover.startsWith('/')) cover = rule.host + cover;

        // 类型判断
        let type = '';
        if (url.indexOf('/movie/') >= 0) type = '电影';
        else if (url.indexOf('/tv/') >= 0) type = '电视剧';

        // 详情字段
        let content = (pdfh(html, '.product-excerpt:contains(Summary) span && Text') || '').replace(/^Summary[：:]\s*/, '').trim();
        let director = (pdfh(html, '.product-excerpt:contains(Directors) span && Text') || '').replace(/^Directors[：:]\s*/, '').trim();
        let actor = (pdfh(html, '.product-excerpt:contains(Casts) span && Text') || '').replace(/^Casts[：:]\s*/, '').trim().replace(/\s*\/\s*/g, ',');

        // ===== 关键: 提取 infoid + m3u8 数组 =====
        // 页面源码: <script>classid=2;classurl='/tv/';infoid=8272;sub='...';m3u8=['1','2','3','4','5','6','7','8']</script>
        let infoId = (html.match(/infoid\s*=\s*(\d+)/) || [])[1] || '';
        if (!infoId) {
            let urlMatch = url.match(/\/(\d+)\.html/);
            if (urlMatch) infoId = urlMatch[1];
        }

        let m3u8Items = [];
        let m3u8Match = html.match(/m3u8\s*=\s*\[(.*?)\]/);
        if (m3u8Match) {
            let arrContent = m3u8Match[1];
            let itemRegex = /'([^']*)'|"([^"]*)"/g;
            let m;
            let seen = new Set();
            while ((m = itemRegex.exec(arrContent)) !== null) {
                let v = (m[1] || m[2] || '').trim();
                if (v && !seen.has(v)) {
                    seen.add(v);
                    m3u8Items.push(v);
                }
            }
        }

        // 构造播放列表
        let playFrom = [];
        let playUrl = [];
        if (m3u8Items.length > 0 && infoId) {
            playFrom.push('PPnix');
            let urls = m3u8Items.map(function(ep, i) {
                var epTitle = m3u8Items.length > 1 ? '第' + (i + 1) + '集' : (ep || '正片');
                // 视频直链: /info/m3u8/{infoid}/{ep}.m3u8
                var streamUrl = rule.host + '/info/m3u8/' + infoId + '/' + encodeURIComponent(ep) + '.m3u8';
                return epTitle + '$' + streamUrl;
            });
            playUrl.push(urls.join('#'));
        } else {
            playFrom.push('PPnix');
            playUrl.push('播放$' + url);
        }

        // 评分
        var score = (pdfh(html, '.rate && Text') || '').trim();
        var remark = score ? '评分 ' + score : '';

        VOD = {
            vod_id: url,
            vod_name: nameNoYear || '未知',
            vod_pic: cover || '',
            type_name: type,
            vod_year: year,
            vod_director: director,
            vod_actor: actor,
            vod_content: content,
            vod_remarks: remark,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$')
        };
    }),

    // === 搜索 ===
    // 实际URL: /search/{keyword}-{offset}-.html (offset = 0,1,2...)
    // drpy2 传入的 input = /search/{keyword}-{fypage}-.html (fypage 从1开始)
    // 需要修正 offset = fypage - 1
    搜索: $js.toString(() => {
        let d = [];
        let page = MY_PAGE || 1;
        // 修正 offset: fypage 从1开始, 实际 offset = fypage - 1
        let url = input.replace(/(\d+)(?=-\.html$)/, function(m) { return String(Number(m) - 1); });
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        let list = pdfa(html, '.lists-content ul li');
        if (!list || list.length === 0) {
            list = pdfa(html, 'ul li');
        }

        list.forEach(function(it) {
            var href = pdfh(it, 'h2 a && href') || '';
            var name = (pdfh(it, 'h2 a && title') || pdfh(it, 'h2 a && Text') || '').trim();
            var img = pdfh(it, 'a.thumbnail img && src') || pdfh(it, 'img && src') || '';
            var remark = (pdfh(it, '.countrie span && Text') || pdfh(it, '.rate && Text') || '').trim();

            if (!href || !name) return;
            // 只保留影视详情页
            if (!/\/(movie|tv)\/\d+\.html/.test(href)) return;

            if (href.startsWith('//')) href = 'https:' + href;
            else if (href.startsWith('/')) href = rule.host + href;

            if (img && img.startsWith('//')) img = 'https:' + img;
            else if (img && img.startsWith('/')) img = rule.host + img;

            d.push({
                vod_id: href,
                vod_name: name,
                vod_pic: img,
                vod_remarks: remark
            });
        });

        VODS = d;
        if (d.length >= 24) setPage(MY_PAGE, MY_PAGE + 1);
        else setPage(MY_PAGE, MY_PAGE);
    }),

    // === 筛选选项 ===
    filter: {
        "movie": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "剧情", "v": "Drama" }, { "n": "惊悚", "v": "Thriller" },
                { "n": "喜剧", "v": "Comedy" }, { "n": "动作", "v": "Action" },
                { "n": "爱情", "v": "Romance" }, { "n": "犯罪", "v": "Crime" },
                { "n": "悬疑", "v": "Mystery" }, { "n": "科幻", "v": "Sci Fi" },
                { "n": "奇幻", "v": "Fantasy" }, { "n": "冒险", "v": "Adventure" },
                { "n": "恐怖", "v": "Horror" }, { "n": "动画", "v": "Animation" },
                { "n": "战争", "v": "War" }, { "n": "历史", "v": "History" },
                { "n": "传记", "v": "Biography" }, { "n": "西部", "v": "Western" },
                { "n": "音乐", "v": "Music" }, { "n": "运动", "v": "Sport" },
                { "n": "家庭", "v": "Family" }, { "n": "纪录片", "v": "Documentary" }
            ]},
            { "key": "地区", "name": "地区", "value": [
                { "n": "全部", "v": "" },
                { "n": "美国", "v": "United States" }, { "n": "中国", "v": "China" },
                { "n": "韩国", "v": "South Korea" }, { "n": "英国", "v": "United Kingdom" },
                { "n": "日本", "v": "Japan" }, { "n": "台湾", "v": "Taiwan" },
                { "n": "香港", "v": "Hong Kong" }, { "n": "法国", "v": "France" },
                { "n": "泰国", "v": "Thailand" }, { "n": "加拿大", "v": "Canada" }
            ]},
            { "key": "年份", "name": "年份", "value": [
                { "n": "全部", "v": "" },
                { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" },
                { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" },
                { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" },
                { "n": "2020", "v": "2020" }
            ]},
            { "key": "排序", "name": "排序", "value": [
                { "n": "按时间", "v": "newstime" },
                { "n": "按人气", "v": "onclick" },
                { "n": "按评分", "v": "rating" }
            ]}
        ],
        "tv": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "剧情", "v": "Drama" }, { "n": "惊悚", "v": "Thriller" },
                { "n": "喜剧", "v": "Comedy" }, { "n": "动作", "v": "Action" },
                { "n": "爱情", "v": "Romance" }, { "n": "犯罪", "v": "Crime" },
                { "n": "悬疑", "v": "Mystery" }, { "n": "科幻", "v": "Sci Fi" },
                { "n": "奇幻", "v": "Fantasy" }, { "n": "冒险", "v": "Adventure" },
                { "n": "恐怖", "v": "Horror" }, { "n": "动画", "v": "Animation" },
                { "n": "战争", "v": "War" }, { "n": "历史", "v": "History" },
                { "n": "真人秀", "v": "Reality TV" }, { "n": "音乐", "v": "Music" }
            ]},
            { "key": "地区", "name": "地区", "value": [
                { "n": "全部", "v": "" },
                { "n": "美国", "v": "United States" }, { "n": "中国", "v": "China" },
                { "n": "韩国", "v": "South Korea" }, { "n": "英国", "v": "United Kingdom" },
                { "n": "日本", "v": "Japan" }, { "n": "台湾", "v": "Taiwan" },
                { "n": "香港", "v": "Hong Kong" }, { "n": "法国", "v": "France" },
                { "n": "泰国", "v": "Thailand" }, { "n": "加拿大", "v": "Canada" }
            ]},
            { "key": "年份", "name": "年份", "value": [
                { "n": "全部", "v": "" },
                { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" },
                { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" },
                { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" },
                { "n": "2020", "v": "2020" }
            ]},
            { "key": "排序", "name": "排序", "value": [
                { "n": "按时间", "v": "newstime" },
                { "n": "按人气", "v": "onclick" },
                { "n": "按评分", "v": "rating" }
            ]}
        ]
    }
};
