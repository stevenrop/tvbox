// LookMovie v2 - DRPY2 TVBox 源
// 网站: https://ww1.lookmovie.pn
// 更新: v2 - 增加类型分类标签、修复电视剧详情页、列出所有分辨率
// 配置: {"key":"lookmovie","name":"LookMovie","type":3,"api":"http://rihou.cc:88/js/drpy2.min.js","ext":"https://raw.githubusercontent.com/你的用户名/tvbox/main/lookmovie.js"}

var rule = {
    title: 'LookMovie',
    host: 'https://ww1.lookmovie.pn',
    homeUrl: '/',
    // fyclass 动态切换: movies=电影列表, shows=电视剧列表, movies/genre/xxx=电影类型, shows/genre/xxx=电视剧类型
    url: '/fyclass?page=fypage',
    filter_url: '/fyclass/genre/{{fl.类型}}?page=fypage',
    filter_def: {
        movies: { 类型: '' },
        shows: { 类型: '' }
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
    // 分类标签: 电影 + 电视剧 + 电影各类型 + 电视剧各类型
    class_name: '电影&电视剧&动作&冒险&动画&喜剧&犯罪&纪录&剧情&家庭&奇幻&历史&恐怖&音乐&悬疑&爱情&科幻&惊悚&战争&西部',
    class_url: 'movies&shows&movies/genre/action&movies/genre/adventure&movies/genre/animation&movies/genre/comedy&movies/genre/crime&movies/genre/documentary&movies/genre/drama&movies/genre/family&movies/genre/fantasy&movies/genre/history&movies/genre/horror&movies/genre/music&movies/genre/mystery&movies/genre/romance&movies/genre/science-fiction&movies/genre/thriller&movies/genre/war&movies/genre/western',
    detailUrl: '',
    limit: 20,
    play_parse: true,
    lazy: $js.toString(() => {
        if (input && input.indexOf('.m3u8') > 0) {
            input = { parse: 0, url: input, header: rule.headers };
        } else {
            input = { parse: 1, url: input, header: rule.headers };
        }
    }),

    // === 列表标准格式: 选择器;标题;图片;副标题;链接 ===
    推荐: '.slide-item;h2.slide-item__title&&Text;img.owl-lazy&&data-src-landscape;.slide-item__stat span&&Text;a[href^="/movies/view"]&&href',
    一级: '.movie-item-style-2;h6 a&&Text;img&&data-src;.rate span&&Text;h6 a&&href',
    搜索: '.movie-item-style-2;h6 a&&Text;img&&data-src;.rate span&&Text;h6 a&&href',

    // === 二级详情 (电影+电视剧通用，自动检测) ===
    二级: $js.toString(() => {
        let url = input;
        let isShow = url.indexOf('/shows/') >= 0;
        let html = request(url, { headers: rule.headers, timeout: rule.timeout });

        // 标题: h1.bd-hd
        let title = (pdfh(html, 'h1.bd-hd && Text') || '').trim();
        let nameNoYear = title.replace(/\s*\(\d{4}\)\s*$/, '').trim() || title;
        let yearMatch = title.match(/\((\d{4})\)/);
        let year = yearMatch ? yearMatch[1] : '';

        // 封面 - 统一用 og:image 获取（电影和电视剧都有）
        let cover = '';
        let ogMatch = html.match(/property="og:image"\s*content="([^"]+)"/);
        if (ogMatch) {
            cover = ogMatch[1];
            if (cover.startsWith('/')) cover = rule.host + cover;
        }
        // 备用: movie_storage (电影) 或 show_storage (电视剧)
        if (!cover) {
            let msMatch = html.match(/movie_storage\s*=\s*\{[^}]+"movie_poster"\s*:\s*"([^"]+)"/);
            if (msMatch) {
                cover = rule.host + msMatch[1];
            }
        }
        if (!cover) {
            let bgMatch = html.match(/data-background-image="([^"]+\.webp)"/);
            if (bgMatch) {
                cover = rule.host + bgMatch[1];
            }
        }

        // 类型
        let type = isShow ? '电视剧' : '电影';

        // 评分
        let score = (pdfh(html, '.rate span && Text') || pdfh(html, '.movie-rate .rate span && Text') || '').trim();

        // 详情描述
        let content = (pdfh(html, 'p.description && Text') || '').trim();

        // 演员
        let actor = '';
        let actorMatch = html.match(/Stars:<\/h6>([\s\S]*?)<\/div>/);
        if (actorMatch) {
            let names = actorMatch[1].match(/actor__name[^>]*>([^<]+)/g);
            if (names) {
                actor = names.map(function(n) { return n.replace(/actor__name[^>]*>/, '').trim(); }).join(',');
            }
        }

        // 副标题
        let remark = score ? '评分 ' + score : '';

        // === 构建播放列表 ===
        let playFrom = [];
        let playUrl = [];
        let expires = Math.floor(Date.now() / 1000) + 86400;

        if (isShow) {
            // === 电视剧: 调用 episode-list API 获取所有季/集 ===
            let idShow = '';
            // show_storage 格式: window['show_storage'] = { id_show: 312, ... }
            let ssMatch = html.match(/id_show["\s:]+(\d+)/);
            if (ssMatch) {
                idShow = ssMatch[1];
            }

            if (idShow) {
                let listApi = rule.host + '/api/v2/download/episode/list?id=' + idShow;
                let listResult = request(listApi, { headers: rule.headers, timeout: rule.timeout });
                if (listResult) {
                    try {
                        let listData = JSON.parse(listResult);
                        if (listData.list) {
                            playFrom.push('LookMovie');
                            let epUrls = [];
                            // 遍历每季每集
                            let seasons = Object.keys(listData.list);
                            for (let s = 0; s < seasons.length; s++) {
                                let season = seasons[s];
                                let episodes = listData.list[season];
                                let epKeys = Object.keys(episodes);
                                for (let e = 0; e < epKeys.length; e++) {
                                    let epNum = epKeys[e];
                                    let epInfo = episodes[epNum];
                                    let idEp = epInfo.id_episode;
                                    if (idEp) {
                                        // 调用 episode-access API 获取视频地址
                                        let apiUrl = rule.host + '/api/v1/security/episode-access?id_episode=' + idEp + '&hash=lookmovie_tvbox&expires=' + expires;
                                        let apiResult = request(apiUrl, { headers: rule.headers, timeout: rule.timeout });
                                        if (apiResult) {
                                            try {
                                                let apiData = JSON.parse(apiResult);
                                                if (apiData.success && apiData.streams) {
                                                    // 找最高可用分辨率
                                                    let streamUrl = '';
                                                    // episode streams 格式: "480", "720", "1080" (无p后缀)
                                                    var qualities = ['1080', '720', '480', '360'];
                                                    for (var i = 0; i < qualities.length; i++) {
                                                        if (apiData.streams[qualities[i]]) {
                                                            streamUrl = apiData.streams[qualities[i]];
                                                            break;
                                                        }
                                                    }
                                                    if (streamUrl) {
                                                        epUrls.push('第' + season + '季第' + epNum + '集$' + streamUrl);
                                                    } else {
                                                        epUrls.push('第' + season + '季第' + epNum + '集$' + url);
                                                    }
                                                } else {
                                                    epUrls.push('第' + season + '季第' + epNum + '集$' + url);
                                                }
                                            } catch (e2) {
                                                epUrls.push('第' + season + '季第' + epNum + '集$' + url);
                                            }
                                        } else {
                                            epUrls.push('第' + season + '季第' + epNum + '集$' + url);
                                        }
                                    }
                                }
                            }
                            if (epUrls.length > 0) {
                                playUrl.push(epUrls.join('#'));
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
        } else {
            // === 电影: 从 movie_storage 提取 id_movie + 调用 movie-access API ===
            let idMovie = '';
            let idMatch = html.match(/id_movie["\s:]+(\d+)/);
            if (idMatch) {
                idMovie = idMatch[1];
            }

            if (idMovie) {
                let apiUrl = rule.host + '/api/v1/security/movie-access?id_movie=' + idMovie + '&hash=lookmovie_tvbox&expires=' + expires;
                let apiResult = request(apiUrl, { headers: rule.headers, timeout: rule.timeout });

                if (apiResult) {
                    try {
                        let apiData = JSON.parse(apiResult);
                        if (apiData.success && apiData.streams) {
                            playFrom.push('LookMovie');
                            // 列出所有可用分辨率 (通常免费用户只有480p)
                            var qualities = ['1080p', '720p', '480p', '360p'];
                            let streamUrl = '';
                            let qualityLabel = '';
                            for (var i = 0; i < qualities.length; i++) {
                                if (apiData.streams[qualities[i]]) {
                                    streamUrl = apiData.streams[qualities[i]];
                                    qualityLabel = qualities[i];
                                    break;
                                }
                            }
                            if (streamUrl) {
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
        }

        VOD = {
            vod_id: url,
            vod_name: nameNoYear || '未知',
            vod_pic: cover || '',
            type_name: type,
            vod_year: year,
            vod_director: '',
            vod_actor: actor || '',
            vod_content: content || '',
            vod_remarks: remark,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$')
        };
    }),

    // === 筛选选项 ===
    filter: {
        "movies": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "动作", "v": "action" }, { "n": "冒险", "v": "adventure" },
                { "n": "动画", "v": "animation" }, { "n": "喜剧", "v": "comedy" },
                { "n": "犯罪", "v": "crime" }, { "n": "纪录片", "v": "documentary" },
                { "n": "剧情", "v": "drama" }, { "n": "家庭", "v": "family" },
                { "n": "奇幻", "v": "fantasy" }, { "n": "历史", "v": "history" },
                { "n": "恐怖", "v": "horror" }, { "n": "音乐", "v": "music" },
                { "n": "悬念", "v": "mystery" }, { "n": "爱情", "v": "romance" },
                { "n": "科幻", "v": "science-fiction" }, { "n": "惊悚", "v": "thriller" },
                { "n": "战争", "v": "war" }, { "n": "西部", "v": "western" }
            ]}
        ],
        "shows": [
            { "key": "类型", "name": "类型", "value": [
                { "n": "全部", "v": "" },
                { "n": "动作", "v": "action" }, { "n": "冒险", "v": "adventure" },
                { "n": "动画", "v": "animation" }, { "n": "喜剧", "v": "comedy" },
                { "n": "犯罪", "v": "crime" }, { "n": "纪录片", "v": "documentary" },
                { "n": "剧情", "v": "drama" }, { "n": "家庭", "v": "family" },
                { "n": "奇幻", "v": "fantasy" }, { "n": "恐怖", "v": "horror" },
                { "n": "音乐", "v": "music" }, { "n": "悬念", "v": "mystery" },
                { "n": "爱情", "v": "romance" }, { "n": "科幻", "v": "science-fiction" },
                { "n": "肥皂剧", "v": "soap" }, { "n": "西部", "v": "western" }
            ]}
        ]
    }
};
