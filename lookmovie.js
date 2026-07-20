// LookMovie v2 - DRPY2 TVBox 源
// 网站: https://ww1.lookmovie.pn
// 修复: 新片不从开头播放的问题

var rule = {
    title: 'LookMovie',
    host: 'https://ww1.lookmovie.pn',
    homeUrl: '/',
    url: '/fyclass?page=fypage',
    filter_url: '/movies/genre/{{fl.类型}}?page=fypage',
    filter_def: {
        movie: { 类型: '', 年份: '' },
        tv: { 类型: '', 年份: '' }
    },
    searchUrl: '/movies/search/?q=**&page=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 1,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Referer': 'https://ww1.lookmovie.pn/'
    },
    timeout: 15000,
    class_name: '电影&电视剧',
    class_url: 'movies&shows',
    detailUrl: '',
    limit: 20,
    play_parse: true,
    lazy: $js.toString(() => {
        if (input && input.indexOf('.m3u8') > 0) {
            // === 修复: 清洗URL，强制从头播放 ===
            var u = input;
            // 1. 移除已有的 #fragment（可能包含位置参数）
            if (u.indexOf('#') >= 0) {
                u = u.split('#')[0];
            }
            // 2. 移除可能的 start/begin/offset/pos 位置参数（保留token等认证参数）
            u = u.replace(/[?&](start|begin|offset|pos|seek)=[^&]*/gi, '');
            // 3. 修复URL末尾多余的 ? 或 &
            u = u.replace(/[?&]$/, '');
            // 4. 添加 #t=0 强制从0秒开始播放
            u = u + '#t=0';
            input = { parse: 0, url: u, header: rule.headers };
        } else {
            input = { parse: 1, url: input, header: rule.headers };
        }
    }),

    推荐: '.slide-item;h2.slide-item__title&&Text;img.owl-lazy&&data-src-landscape;.slide-item__stat span&&Text;a[href^="/movies/view"]&&href',
    一级: '.movie-item-style-2;h6 a&&Text;img&&data-src;.rate span&&Text;h6 a&&href',
    搜索: '.movie-item-style-2;h6 a&&Text;img&&data-src;.rate span&&Text;h6 a&&href',

    二级: $js.toString(() => {
        let url = input;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        let title = (pdfh(html, 'h1.bd-hd && Text') || '').trim();
        let nameNoYear = title.replace(/\s*\(\d{4}\)\s*$/, '').trim() || title;
        let yearMatch = title.match(/\((\d{4})\)/);
        let year = yearMatch ? yearMatch[1] : '';

        let cover = '';
        let msMatch = html.match(/movie_storage\s*=\s*\{[^}]+"movie_poster"\s*:\s*"([^"]+)"/);
        if (msMatch) {
            cover = 'https://ww1.lookmovie.pn' + msMatch[1];
        } else {
            let ogMatch = html.match(/property="og:image"\s*content="([^"]+)"/);
            if (ogMatch) {
                cover = ogMatch[1];
                if (cover.startsWith('/')) cover = 'https://ww1.lookmovie.pn' + cover;
            }
        }
        if (!cover) {
            let bgMatch = html.match(/movie__poster[^>]+data-background-image="([^"]+)"/);
            if (bgMatch) {
                cover = bgMatch[1];
                if (cover.startsWith('/')) cover = 'https://ww1.lookmovie.pn' + cover;
            }
        }

        let type = '';
        let genresText = (pdfh(html, '.genres && Text') || '').trim();
        if (url.indexOf('/shows/') >= 0) type = '电视剧';
        else type = '电影';

        let score = (pdfh(html, '.rate span && Text') || '').trim();
        let content = (pdfh(html, '.description-wrapper p.description && Text') || pdfh(html, 'p.description && Text') || '').trim();

        let actor = '';
        let actorItems = pd(html, '.actor__name && Text');
        if (actorItems && actorItems.length > 0) {
            actor = actorItems.join(',');
        }
        if (!actor) {
            let actorMatch = html.match(/Stars:<\/h6>([\s\S]*?)<\/div>/);
            if (actorMatch) {
                let names = actorMatch[1].match(/actor__name[^>]*>([^<]+)/g);
                if (names) {
                    actor = names.map(function(n) { return n.replace(/actor__name[^>]*>/, '').trim(); }).join(',');
                }
            }
        }

        let idMovie = '';
        let idMatch = html.match(/id_movie["\s:]+(\d+)/);
        if (idMatch) {
            idMovie = idMatch[1];
        }

        let playFrom = [];
        let playUrl = [];

        if (idMovie) {
            let expires = Math.floor(Date.now() / 1000) + 86400;
            let apiUrl = 'https://ww1.lookmovie.pn/api/v1/security/movie-access?id_movie=' + idMovie + '&hash=lookmovie_tvbox&expires=' + expires;
            let apiResult = request(apiUrl, { headers: rule.headers, timeout: rule.timeout });

            if (apiResult) {
                try {
                    let apiData = JSON.parse(apiResult);
                    if (apiData.success && apiData.streams) {
                        playFrom.push('LookMovie');

                        let streamUrl = '';
                        let qualityLabel = '';
                        var qualities = ['1080p', '720p', '480p', '360p'];
                        for (var i = 0; i < qualities.length; i++) {
                            if (apiData.streams[qualities[i]]) {
                                streamUrl = apiData.streams[qualities[i]];
                                qualityLabel = qualities[i];
                                break;
                            }
                        }

                        if (streamUrl) {
                            // === 修复: 清洗stream URL中的位置参数 ===
                            // 移除 #fragment（可能含 #t=xxx 位置信息）
                            streamUrl = streamUrl.split('#')[0];
                            // 移除 start/begin/offset/pos/seek 等位置参数
                            streamUrl = streamUrl.replace(/[?&](start|begin|offset|pos|seek)=[^&]*/gi, '');
                            // 修复末尾多余的 ? 或 &
                            streamUrl = streamUrl.replace(/[?&]$/, '');

                            playUrl.push(qualityLabel + '$' + streamUrl);
                        } else {
                            playUrl.push('播放$' + url);
                        }
                    } else {
                        playFrom.push('LookMovie');
                        playUrl.push('播放$' + url);
                    }
                } catch (e) {
                    playFrom.push('LookMovie');
                    playUrl.push('播放$' + url);
                }
            } else {
                playFrom.push('LookMovie');
                playUrl.push('播放$' + url);
            }
        } else {
            playFrom.push('LookMovie');
            playUrl.push('播放$' + url);
        }

        let remark = score ? '评分 ' + score : '';

        VOD = {
            vod_id: idMovie || url,
            vod_name: nameNoYear || '未知',
            vod_pic: cover || '',
            type_name: type,
            vod_year: year,
            vod_director: '',
            vod_actor: actor || '',
            vod_content: content || '',
            vod_remarks: remark,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$'),
            vod_play_note: ''
        };
    }),

    filter: {
        "movie": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "动作", "v": "action" }, { "n": "冒险", "v": "adventure" },
                { "n": "动画", "v": "animation" }, { "n": "喜剧", "v": "comedy" },
                { "n": "犯罪", "v": "crime" }, { "n": "纪录片", "v": "documentary" },
                { "n": "剧情", "v": "drama" }, { "n": "家庭", "v": "family" },
                { "n": "奇幻", "v": "fantasy" }, { "n": "历史", "v": "history" },
                { "n": "恐怖", "v": "horror" }, { "n": "音乐", "v": "music" },
                { "n": "悬疑", "v": "mystery" }, { "n": "爱情", "v": "romance" },
                { "n": "科幻", "v": "science fiction" }, { "n": "惊悚", "v": "thriller" },
                { "n": "战争", "v": "war" }, { "n": "西部", "v": "western" }
            ]},
            { "key": "年份", "name": "年份", "value": [
                { "n": "全部", "v": "" },
                { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" },
                { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" },
                { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" },
                { "n": "2020", "v": "2020" }
            ]}
        ],
        "tv": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "动作", "v": "action" }, { "n": "冒险", "v": "adventure" },
                { "n": "动画", "v": "animation" }, { "n": "喜剧", "v": "comedy" },
                { "n": "犯罪", "v": "crime" }, { "n": "纪录片", "v": "documentary" },
                { "n": "剧情", "v": "drama" }, { "n": "家庭", "v": "family" },
                { "n": "奇幻", "v": "fantasy" }, { "n": "历史", "v": "history" },
                { "n": "恐怖", "v": "horror" }, { "n": "音乐", "v": "music" },
                { "n": "悬疑", "v": "mystery" }, { "n": "爱情", "v": "romance" },
                { "n": "科幻", "v": "science fiction" }, { "n": "惊悚", "v": "thriller" },
                { "n": "战争", "v": "war" }, { "n": "西部", "v": "western" }
            ]},
            { "key": "年份", "name": "年份", "value": [
                { "n": "全部", "v": "" },
                { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" },
                { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" },
                { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" },
                { "n": "2020", "v": "2020" }
            ]}
        ]
    }
};
