// PPnix v3 - 标准 drpy2 格式 (无自定义JS一级)
// 网站: https://www.ppnix.com
// 使用标准选择器格式，完全避免自定义JS函数的兼容问题

var rule = {
    title: 'PPnix',
    host: 'https://www.ppnix.com',
    homeUrl: '/',
    // fyclass 动态切换分类, fyfilter 传递筛选参数
    // (fypage-1) 处理分页偏移: 第1页offset=0, 第2页offset=1
    url: '/fyclass/fyfilter.html',
    filter_url: '{{fl.类型}}-{{fl.地区}}-{{fl.年份}}-(fypage-1)-{{fl.排序}}',
    filter_def: {
        movie: { 类型: '', 地区: '', 年份: '', 排序: 'newstime' },
        tv:    { 类型: '', 地区: '', 年份: '', 排序: 'newstime' }
    },
    searchUrl: '/search/**-(fypage-1)-.html',
    searchable: 2,
    quickSearch: 0,
    filterable: 1,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Referer': 'https://www.ppnix.com/'
    },
    timeout: 15000,
    class_name: '电影&电视剧',
    class_url: 'movie&tv',
    detailUrl: '',
    limit: 12,
    play_parse: true,
    lazy: $js.toString(() => {
        if (input && input.indexOf('.m3u8') > 0) {
            input = { parse: 0, url: input, header: rule.headers };
        } else {
            input = { parse: 1, url: input, header: rule.headers };
        }
    }),

    // === 列表标准格式: 选择器;标题;图片;副标题;链接 ===
    // 结构: <li><a class=thumbnail><img class=thumb src=...></a><h2><a href=... title=...>Title</a></h2><footer><span class=rate>评分</span></footer></li>
    推荐: '*',
    一级: '.lists-content ul li;h2 a&&title;a.thumbnail img&&src;.rate&&Text;h2 a&&href',

    // === 搜索 ===
    搜索: '.lists-content ul li;h2 a&&title;a.thumbnail img&&src;.rate&&Text;h2 a&&href',

    // === 二级详情 (需要自定义JS提取infoid+m3u8) ===
    二级: $js.toString(() => {
        let url = input;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        // 标题: h1.product-title
        let title = (pdfh(html, 'h1.product-title && Text') || pdfh(html, 'h1 && Text') || '').trim();
        let nameNoYear = title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
        let yearMatch = title.match(/\((\d{4})\)/);
        let year = yearMatch ? yearMatch[1] : '';

        // 封面
        let cover = pdfh(html, 'img.thumb && src') || '';
        if (cover && cover.startsWith('//')) cover = 'https:' + cover;
        else if (cover && cover.startsWith('/')) cover = rule.host + cover;

        // 类型
        let type = '';
        if (url.indexOf('/movie/') >= 0) type = '电影';
        else if (url.indexOf('/tv/') >= 0) type = '电视剧';

        // 详情字段
        let content = (pdfh(html, '.product-excerpt:contains(Summary) span && Text') || '').replace(/^Summary[：:]\s*/, '').trim();
        let director = (pdfh(html, '.product-excerpt:contains(Directors) span && Text') || '').replace(/^Directors[：:]\s*/, '').trim();
        let actor = (pdfh(html, '.product-excerpt:contains(Casts) span && Text') || '').replace(/^Casts[：:]\s*/, '').trim().replace(/\s*\/\s*/g, ',');

        // 提取 infoid + m3u8 数组
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
