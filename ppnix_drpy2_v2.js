// PPnix 精简版 drpy2 适配脚本
// 适配: https://www.ppnix.com
// 功能: 分类浏览、多条件筛选、搜索、播放

var rule = {
    title: 'PPnix',
    host: 'https://www.ppnix.com',
    url: '/fyclassfyfilter',
    searchUrl: '/search.html?keyword=**&page=fypage',
    searchable: 2,
    quickSearch: 1,
    filterable: 1,
    filter_url: '{{fl.类型}}-{{fl.地区}}-{{fl.年份}}-{{fl.排序}}-fyfilter.html?page=fypage',
    filter_def: {
        movie: {类型: '', 地区: '', 年份: '', 排序: ''},
        tv: {类型: '', 地区: '', 年份: '', 排序: ''}
    },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    timeout: 15000,
    class_name: '电影&电视剧',
    class_url: 'movie&tv',
    cate_exclude: '^最近更新|^热播|^Popular|^Trending|^Top',
    play_parse: true,
    lazy: $js.toString(() => {
        let url = input.url || '';
        if (!url) return input;
        // 已解析的直接播放
        if (/\.(m3u8|mp4|m4v|webm)(\?|#|$)/i.test(url)) {
            input = { parse: 0, url: url, header: rule.headers };
        } else {
            input = { parse: 1, url: url, header: rule.headers };
        }
    }),

    一级: $js.toString(() => {
        let d = [];
        let html = fetch(input, { headers: rule.headers, timeout: rule.timeout });
        let $ = cheerio.load(html, { xmlMode: true });
        
        // 选择影视条目
        let items = [];
        $('.trending-list li, .popular-movie-list li, .popular-tv-list li, .top-movie-list li, .top-tv-show li, .module-search-content .module-item, .mod-hot-list li, .module-play-list-content a, .lists-content li, .module-list .module-items .module-item').each((i, el) => {
            let url = $(el).find('a:first').attr('href') || '';
            let name = $(el).find('a:first').text().trim() || $(el).find('h2,a').first().text().trim();
            let img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
            let remark = $(el).find('.score,.module-item-note,.right,.note,.text').first().text().trim();
            
            if (name && url) items.push({url, name, img, remark, el});
        });
        
        // fallback: 更宽松的搜索
        if (items.length === 0) {
            $('a[href^="/movie/"], a[href^="/tv/"]').each((i, el) => {
                let href = $(el).attr('href');
                let name = $(el).text().trim();
                let parent = $(el).closest('li, .module-item, .mod-detail');
                if (parent.length === 0) parent = $(el).parent();
                
                if (name && href && !href.includes('javascript')) {
                    let img = parent.find('img').first().attr('src') || '';
                    let remark = parent.find('.score,.note,.text,.right').first().text().trim();
                    items.push({url: href, name, img, remark, el});
                }
            });
        }
        
        items.forEach(item => {
            let url = item.url;
            if (url.startsWith('//')) url = 'https:' + url;
            else if (url.startsWith('/')) url = rule.host + url;
            
            let img = item.img;
            if (img && img.startsWith('//')) img = 'https:' + img;
            else if (img && img.startsWith('/')) img = rule.host + img;
            
            d.push({
                vod_id: url,
                vod_name: item.name.replace(/[\s\n\r]+/g, ' ').trim(),
                vod_pic: img || '',
                vod_remarks: item.remark || ''
            });
        });
        
        // 分页
        let pagecount = 1;
        let nextPage = $('.pagination a.next, .page a.next, .mod-page a:contains("下一页")').first().attr('href') || '';
        let pages = [];
        $('.pagination a:not(.next):not(.prev), .page a').each((i, el) => {
            let txt = $(el).text().trim();
            if (/^\d+$/.test(txt)) pages.push(parseInt(txt));
        });
        if (pages.length > 0) pagecount = Math.max(...pages);
        
        MY_PAGE = parseInt(MY_PAGE) || 1;
        MY_COUNT = pagecount || 1;
        MY_TOTAL = d.length;
        
        setResult(d);
    }),

    二级: $js.toString(() => {
        let html = fetch(input, { headers: rule.headers, timeout: rule.timeout });
        let $ = cheerio.load(html, { xmlMode: true });
        
        let vod = {};
        
        // 标题
        let title = $('h1').first().text().trim() || $('.module-info-heading').text().trim() || '';
        vod.vod_name = title || '未知';
        
        // 年份
        let yearMatch = title.match(/\((\d{4})\)/);
        vod.vod_year = yearMatch ? yearMatch[1] : '';
        
        // 封面
        let cover = $('meta[property="og:image"]').attr('content') || '';
        if (!cover) cover = $('.module-cover img,.video-cover img,.mod-detail .thumb img').first().attr('src') || '';
        if (cover && cover.startsWith('//')) cover = 'https:' + cover;
        vod.vod_pic = cover;
        
        // 评分
        let score = $('.module-info-item .score,.video-info-items .score, .info-score,.module-item-score').first().text().trim();
        vod.vod_remarks = score;
        
        // 类型
        let type = $('.module-info-tag,.video-info-tags a').map((i, el) => $(el).text().trim()).get().join('/');
        vod.type_name = type;
        
        // 地区
        let area = $('.module-info-item:contains("国家"), .module-info-item:contains("地区"), .video-info-items:contains("地区")').next().text().trim();
        if (!area) area = $('meta[property="og:site"]').attr('content');
        vod.vod_area = area;
        
        // 导演
        let director = $('.module-info-item:contains("导演"), .video-info-items:contains("导演")').next().text().trim();
        vod.vod_director = director;
        
        // 主演
        let actor = $('.module-info-item:contains("主演"), .video-info-items:contains("主演")').next().text().trim();
        vod.vod_actor = actor;
        
        // 简介
        let content = $('.module-info-introduction,.video-info-content .text,.video-info-items.summary, meta[name="description"]').attr('content') || '';
        if (!content) content = $('.module-info-content.parser1,.video-info-main .tab-content').text().trim();
        vod.vod_content = content;
        
        // 播放列表
        let playFrom = [];
        let playUrl = [];
        
        // 尝试多种播放器/集数列表选择器
        let sources = [];
        $('.module-tab-item,.tab-item,.play-source-tab,.source-tab, .player-source-tab').each((i, el) => {
            let name = $(el).text().trim();
            if (name) sources.push(name);
        });
        
        // 尝试获取每个源的集数列表
        $('.module-play-list,.play-list,.player-list,.module-play-list-content,.play-list-content').each((si, el) => {
            let urls = [];
            $(el).find('a').each((i, a) => {
                let title = $(a).text().trim();
                let href = $(a).attr('href') || '';
                if (title && href && !href.includes('javascript') && href !== '#') {
                    if (href.startsWith('//')) href = 'https:' + href;
                    else if (href.startsWith('/')) href = rule.host + href;
                    urls.push(title + '$' + href);
                }
            });
            if (urls.length > 0) playUrl.push(urls.join('#'));
        });
        
        // fallback: 收集所有播放链接
        if (playUrl.length === 0) {
            let allPlayLinks = [];
            $('a[href*="/tv/"], a[href*="/movie/"]').each((i, el) => {
                let href = $(el).attr('href');
                let name = $(el).text().trim();
                if (href && name && !href.includes('javascript') && href !== '#' && $(el).closest('.module-player-list,.player-list,.module-play-list').length > 0) {
                    if (href.startsWith('/')) href = rule.host + href;
                    allPlayLinks.push(name + '$' + href);
                }
            });
            if (allPlayLinks.length > 0) playUrl.push(allPlayLinks.join('#'));
        }
        
        if (playFrom.length === 0) playFrom.push('PPnix');
        if (playUrl.length === 0) playUrl.push('点击播放$' + input);
        
        vod.vod_play_from = playFrom.join('$$$');
        vod.vod_play_url = playUrl.join('$$$');
        
        return vod;
    }),

    搜索: $js.toString(() => {
        let html = fetch(input, { headers: rule.headers, timeout: rule.timeout });
        let $ = cheerio.load(html, { xmlMode: true });
        
        let d = [];
        let items = [];
        
        // 搜索结果
        $('.module-search-content .module-item,.search-list li,.mod-hot-list li,.module-list .module-items .module-search-item').each((i, el) => {
            let url = $(el).find('a').first().attr('href') || '';
            let name = $(el).find('a').first().text().trim() || $(el).find('h2,.title').first().text().trim();
            let img = $(el).find('img').first().attr('src') || '';
            let remark = $(el).find('.module-item-text,.module-item-note,.score,.right').first().text().trim();
            if (name && url) items.push({url, name, img, remark});
        });
        
        // fallback
        if (items.length === 0) {
            $('a[href^="/movie/"], a[href^="/tv/"]').each((i, el) => {
                let url = $(el).attr('href');
                let name = $(el).text().trim();
                let parent = $(el).closest('li,.module-item');
                let img = parent.find('img').first().attr('src') || '';
                let remark = parent.find('.score,.note').first().text().trim();
                if (name && url) items.push({url, name, img, remark});
            });
        }
        
        items.forEach(item => {
            let url = item.url;
            if (url.startsWith('//')) url = 'https:' + url;
            else if (url.startsWith('/')) url = rule.host + url;
            
            let img = item.img;
            if (img && img.startsWith('//')) img = 'https:' + img;
            else if (img && img.startsWith('/')) img = rule.host + img;
            
            d.push({
                vod_id: url,
                vod_name: item.name.replace(/[\s\n\r]+/g, ' ').trim(),
                vod_pic: img || '',
                vod_remarks: item.remark || ''
            });
        });
        
        MY_PAGE = 1;
        MY_COUNT = 1;
        setResult(d);
    }),

    filter: {
        "movie": [
            {"key": "类型", "name": "类型", "value": [
                {"n": "全部", "v": ""},
                {"n": "剧情", "v": "Drama"}, {"n": "惊悚", "v": "Thriller"}, {"n": "悬疑", "v": "Mystery"},
                {"n": "犯罪", "v": "Crime"}, {"n": "动作", "v": "Action"}, {"n": "喜剧", "v": "Comedy"},
                {"n": "爱情", "v": "Romance"}, {"n": "奇幻", "v": "Fantasy"}, {"n": "科幻", "v": "Sci-Fi"},
                {"n": "冒险", "v": "Adventure"}, {"n": "恐怖", "v": "Horror"}, {"n": "动画", "v": "Animation"},
                {"n": "历史", "v": "History"}, {"n": "战争", "v": "War"}, {"n": "传记", "v": "Biography"},
                {"n": "西部", "v": "Western"}, {"n": "短片", "v": "Short"}, {"n": "运动", "v": "Sport"},
                {"n": "音乐", "v": "Music"}, {"n": "纪录片", "v": "Documentary"}, {"n": "家庭", "v": "Family"}
            ]},
            {"key": "地区", "name": "地区", "value": [
                {"n": "全部", "v": ""},
                {"n": "美国", "v": "United%20States"}, {"n": "中国", "v": "China"},
                {"n": "韩国", "v": "South%20Korea"}, {"n": "英国", "v": "United%20Kingdom"},
                {"n": "日本", "v": "Japan"}, {"n": "台湾", "v": "Taiwan"},
                {"n": "香港", "v": "Hong%20Kong"}, {"n": "法国", "v": "France"},
                {"n": "泰国", "v": "Thailand"}, {"n": "加拿大", "v": "Canada"}
            ]},
            {"key": "年份", "name": "年份", "value": [
                {"n": "全部", "v": ""},
                {"n": "2026", "v": "--2026--"}, {"n": "2025", "v": "--2025--"},
                {"n": "2024", "v": "--2024--"}, {"n": "2023", "v": "--2023--"},
                {"n": "2022", "v": "--2022--"}, {"n": "2021", "v": "--2021--"},
                {"n": "2020", "v": "--2020--"}
            ]},
            {"key": "排序", "name": "排序", "value": [
                {"n": "全部", "v": ""},
                {"n": "时间", "v": "newstime"}, {"n": "热度", "v": "onclick"}, {"n": "评分", "v": "rating"}
            ]}
        ],
        "tv": [
            {"key": "类型", "name": "类型", "value": [
                {"n": "全部", "v": ""},
                {"n": "剧情", "v": "Drama"}, {"n": "惊悚", "v": "Thriller"}, {"n": "悬疑", "v": "Mystery"},
                {"n": "犯罪", "v": "Crime"}, {"n": "动作", "v": "Action"}, {"n": "喜剧", "v": "Comedy"},
                {"n": "爱情", "v": "Romance"}, {"n": "奇幻", "v": "Fantasy"}, {"n": "科幻", "v": "Sci-Fi"},
                {"n": "冒险", "v": "Adventure"}, {"n": "恐怖", "v": "Horror"}, {"n": "动画", "v": "Animation"},
                {"n": "历史", "v": "History"}, {"n": "战争", "v": "War"}, {"n": "传记", "v": "Biography"},
                {"n": "真人秀", "v": "Reality%20TV"}, {"n": "运动", "v": "Sport"},
                {"n": "音乐", "v": "Music"}, {"n": "纪录片", "v": "Documentary"}
            ]},
            {"key": "地区", "name": "地区", "value": [
                {"n": "全部", "v": ""},
                {"n": "美国", "v": "United%20States"}, {"n": "中国", "v": "China"},
                {"n": "韩国", "v": "South%20Korea"}, {"n": "英国", "v": "United%20Kingdom"},
                {"n": "日本", "v": "Japan"}, {"n": "台湾", "v": "Taiwan"},
                {"n": "香港", "v": "Hong%20Kong"}, {"n": "法国", "v": "France"}
            ]},
            {"key": "年份", "name": "年份", "value": [
                {"n": "全部", "v": ""},
                {"n": "2026", "v": "--2026--"}, {"n": "2025", "v": "--2025--"},
                {"n": "2024", "v": "--2024--"}, {"n": "2023", "v": "--2023--"},
                {"n": "2022", "v": "--2022--"}, {"n": "2021", "v": "--2021--"},
                {"n": "2020", "v": "--2020--"}
            ]},
            {"key": "排序", "name": "排序", "value": [
                {"n": "全部", "v": ""},
                {"n": "时间", "v": "newstime"}, {"n": "热度", "v": "onclick"}, {"n": "评分", "v": "rating"}
            ]}
        ]
    }
};

