// PPnix 纯 drpy2 独立脚本 v1
// 使用 drpy2 标准 API (pdfh/pdfa/request), 无外部依赖, 可直接放 GitHub raw 用
// 适配网站: https://www.ppnix.com
//
// 配置示例 (TVBox JSON):
// {
//   "key": "ppnix",
//   "name": "「直」PPnix",
//   "type": 3,
//   "api": "<这个 js 文件 的 raw URL>",
//   "ext": "https://www.ppnix.com"
// }

var rule = {
    title: 'PPnix',
    host: 'https://www.ppnix.com',
    // 新的 URL 模板: /movie/类型-地区-年份-页码偏移-排序.html
    url: '/movie/----newstime.html',
    filterable: 1,
    filter_url: '{{fl.类型}}-{{fl.地区}}-{{fl.年份}}-{{fl.页偏移}}-{{fl.排序}}',
    filter_def: {
        movie: { 类型: '', 地区: '', 年份: '', 页偏移: '', 排序: 'newstime' },
        tv:    { 类型: '', 地区: '', 年份: '', 页偏移: '', 排序: 'newstime' }
    },
    searchUrl: '/search/**--.html?page=fypage',
    searchable: 2,
    quickSearch: 0,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.ppnix.com/movie/'
    },
    timeout: 15000,
    class_name: '电影&电视剧',
    class_url: 'movie&tv',
    // 一级返回的 vod_id 已经是完整 URL, 二级直接用, 不需要 detailUrl 模板
    detailUrl: '',
    limit: 6,
    play_parse: true,
    lazy: $js.toString(() => {
        // input 是 vod_play_url 中 $ 后半段, 即我们直接拼好的 m3u8 直链
        if (input && input.indexOf('.m3u8') > 0) {
            input = { parse: 0, url: input, header: rule.headers };
        } else {
            input = { parse: 1, url: input, header: rule.headers };
        }
    }),

    // 一级列表: 用 js 写法, 处理页码偏移 + 自定义解析
    一级: $js.toString(() => {
        let d = [];
        let page = MY_PAGE || 1;
        
        // 把 filter_def 里的页偏移字段设为 (页码 - 1), 第 1 页就是空字符串
        if (rule.filter_def) {
            Object.keys(rule.filter_def).forEach(cate => {
                rule.filter_def[cate].页偏移 = page > 1 ? String(page - 1) : '';
            });
        }
        
        // input 由 drpy2 用 filter_url + filter_def 替换占位后生成的完整 path
        // 我们需要把 host 也拼上
        let url = input;
        if (url.startsWith('/')) url = rule.host + url;
        
        // 移除可能的 ?page=fypage (备用)
        if (url.indexOf('?page=') >= 0 || url.indexOf('&page=') >= 0) {
            url = url.replace(/([?&])page=fypage/g, '$1page=' + page);
        }
        
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });
        
        // 新的列表选择器 (适应网站结构变化)
        let list = pdfa(html, '.lists-content > ul > li');
        if (!list || list.length === 0) {
            list = pdfa(html, '.lists-content ul li');
        }
        if (!list || list.length === 0) {
            list = pdfa(html, '.movie-grid > .movie-item');
        }
        if (!list || list.length === 0) {
            list = pdfa(html, '.movie-list > .movie-item');
        }
        
        list.forEach(it => {
            let href = pdfh(it, 'a && href') || '';
            let name = (pdfh(it, 'h2 && Text') || pdfh(it, 'h3 && Text') || pdfh(it, '.title && Text') || pdfh(it, 'a && Text') || '').trim();
            let img = pdfh(it, 'img && src') || pdfh(it, '.thumb && src') || pdfh(it, '.poster && src') || '';
            let remark = (pdfh(it, '.rate && Text') || pdfh(it, '.rating && Text') || pdfh(it, '.info && Text') || '').trim();
            
            if (!href || !name) return;
            
            // 补全 URL
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
        
        // 解析分页 (新的分页结构)
        let pageHtml = pdfh(html, '.pagination && Html') || pdfh(html, '.pages && Html') || '';
        let pageCount = page;
        let pageMatches = [...pageHtml.matchAll(/page=(\d+)/g)];
        if (pageMatches.length > 0) {
            pageCount = Math.max(page, ...pageMatches.map(m => Number(m[1])));
        } else if (d.length >= 24) {
            pageCount = page + 1;
        }
        
        VODS = d;
        setPage(page, pageCount);
    }),

    // 二级详情: 核心是从 HTML 里提 infoid 和 m3u8 数组
    二级: $js.toString(() => {
        // input = vod_id (完整详情页 URL)
        let url = input;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });
        
        // 标题
        let title = (pdfh(html, 'h1 && Text') || pdfh(html, 'h2 && Text') || pdfh(html, '.title && Text') || '').trim();
        let nameNoYear = title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title.replace(/\s*\([^)]*\).*/, '').trim();
        let yearMatch = title.match(/\((\d{4})\)/);
        let year = yearMatch ? yearMatch[1] : '';
        
        // 封面
        let cover = pdfh(html, 'img && src') || pdfh(html, '.thumb && src') || pdfh(html, '.poster && src') || '';
        if (cover && cover.startsWith('//')) cover = 'https:' + cover;
        else if (cover && cover.startsWith('/')) cover = rule.host + cover;
        
        // 类型
        let type = '';
        if (url.indexOf('/movie/') >= 0) type = '电影';
        else if (url.indexOf('/tv/') >= 0) type = '电视剧';
        
        // 详情字段 (新的选择器)
        let content = '', director = '', actor = '';
        let infoElements = pdfa(html, '.info-section');
        if (!infoElements || infoElements.length === 0) {
            infoElements = pdfa(html, '.movie-details');
        }
        
        infoElements.forEach(el => {
            let txt = pdfh(el, 'body && Text') || '';
            if (txt.indexOf('简介') >= 0 || txt.indexOf('剧情') >= 0) {
                content = txt.replace(/^.*?[简介剧情：:：]/, '').trim();
            } else if (txt.indexOf('导演') >= 0 || txt.indexOf('导演') >= 0) {
                director = (pdfh(el, 'span && Text') || '').trim();
            } else if (txt.indexOf('主演') >= 0 || txt.indexOf('演员') >= 0) {
                actor = (pdfh(el, 'span && Text') || '').replace(/\s*\/\s*/g, ',').trim();
            }
        });
        
        // ===== 关键: 提取 infoid + m3u8 数组 =====
        // 页面里有: <script>...infoid=8272;sub='...';m3u8=['1','2','3','4','5','6','7'];...</script>
        let infoId = (html.match(/infoid\s*=\s*(\d+)/) || [])[1] || '';
        if (!infoId) {
            // fallback: 从 URL 提取数字
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
            let urls = m3u8Items.map((ep, i) => {
                let title = m3u8Items.length > 1 ? `第${i + 1}集` : (ep || '正片');
                // 直接拼 m3u8 直链 (无需解析)
                let streamUrl = `${rule.host}/info/m3u8/${infoId}/${encodeURIComponent(ep)}.m3u8`;
                return title + '$' + streamUrl;
            });
            playUrl.push(urls.join('#'));
        } else {
            // fallback: 没拿到 m3u8 数组, 只能跳原页
            playFrom.push('PPnix');
            playUrl.push('播放$' + url);
        }
        
        // 评分 (从 title 末尾提取)
        let scoreMatch = title.match(/\s+(\d+(?:\.\d+)?)\s*$/);
        let remark = scoreMatch ? '评分 ' + scoreMatch[1] : '';
        
        // 设置 VOD
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

    搜索: $js.toString(() => {
        let d = [];
        let url = input;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });
        
        let list = pdfa(html, '.lists-content > ul > li');
        if (!list || list.length === 0) list = pdfa(html, '.lists-content ul li');
        
        list.forEach(it => {
            let href = pdfh(it, 'a && href') || '';
            let name = (pdfh(it, 'h2 a && Text') || pdfh(it, 'a && Text') || '').trim();
            let img = pdfh(it, 'img.thumb && src') || pdfh(it, 'img && src') || '';
            let remark = (pdfh(it, 'footer .rate && Text') || pdfh(it, 'footer && Text') || '').trim();
            
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
                { "n": "真人秀", "v": "Reality Show" }, { "n": "音乐", "v": "Music" }
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
