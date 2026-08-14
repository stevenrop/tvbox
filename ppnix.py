# -*- coding: utf-8 -*-

import html
import mimetypes
import re
from urllib.parse import quote, urljoin

import requests
import urllib3
from pyquery import PyQuery as pq

import sys
sys.path.append('..')
from base.spider import Spider

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class Spider(Spider):

    HOST = 'https://www.ppnix.com'
    PAGE_SIZE = 36

    CLASSES = (
        ('电影', 'movie'),
        ('电视剧', 'tv'),
    )

    GENRES_MOVIE = (
        ('动作', 'Action'),
        ('喜剧', 'Comedy'),
        ('剧情', 'Drama'),
        ('惊悚', 'Thriller'),
        ('爱情', 'Romance'),
        ('犯罪', 'Crime'),
        ('冒险', 'Adventure'),
        ('恐怖', 'Horror'),
        ('悬疑', 'Mystery'),
        ('奇幻', 'Fantasy'),
        ('科幻', 'Sci Fi'),
        ('家庭', 'Family'),
        ('动画', 'Animation'),
        ('传记', 'Biography'),
        ('历史', 'History'),
        ('战争', 'War'),
        ('音乐', 'Music'),
        ('运动', 'Sport'),
        ('歌舞', 'Musical'),
        ('纪录', 'Documentary'),
        ('西部', 'Western'),
        ('短片', 'Short'),
    )

    GENRES_TV = (
        ('剧情', 'Drama'),
        ('惊悚', 'Thriller'),
        ('悬疑', 'Mystery'),
        ('犯罪', 'Crime'),
        ('动作', 'Action'),
        ('喜剧', 'Comedy'),
        ('爱情', 'Romance'),
        ('奇幻', 'Fantasy'),
        ('科幻', 'Sci Fi'),
        ('冒险', 'Adventure'),
        ('恐怖', 'Horror'),
        ('动画', 'Animation'),
        ('历史', 'History'),
        ('战争', 'War'),
        ('家庭', 'Family'),
        ('传记', 'Biography'),
        ('西部', 'Western'),
        ('短片', 'Short'),
        ('运动', 'Sport'),
        ('真人秀', 'Reality TV'),
        ('音乐', 'Music'),
        ('纪录', 'Documentary'),
    )

    SORT_MAP = {
        'default': '',
        'time': 'newstime',
        'hits': 'onclick',
        'score': 'rating',
    }

    def __init__(self):
        self.host = self.HOST
        self.ext = ''
        self.session = requests.Session()
        self.headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/138.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'Cache-Control': 'no-cache',
        }
        self.classes = [
            {'type_name': name, 'type_id': tid}
            for name, tid in self.CLASSES
        ]

    def getName(self):
        return 'PPnix'

    def getDependence(self):
        return []

    def setExtendInfo(self, extend):
        self.ext = extend or ''
        return None

    def init(self, extend=''):
        self.setExtendInfo(extend if extend else self.ext)
        return None

    def homeLayout(self):
        return 0

    def manualVideoCheck(self):
        return False

    def isVideoFormat(self, url):
        value = str(url or '').lower()
        return any(m in value for m in ('.m3u8', '.mp4', '.m4v', '.flv', '.webm', '.ts'))

    def destroy(self):
        try:
            self.session.close()
        except Exception:
            pass

    def homeContent(self, filter=False):
        result = {'class': self.classes, 'filters': {}}
        if filter:
            filters = {}
            for _, tid in self.CLASSES:
                filters[tid] = self._build_filter(tid)
            result['filters'] = filters
        return result

    def getHomeContent(self, filter=False):
        return self.homeContent(filter)

    def homeVideoContent(self):
        try:
            response = self._request(self.host + '/')
            videos = self._parse_cards(response.text)
            return {'list': videos}
        except Exception as e:
            return {'list': []}

    def categoryContent(self, tid, pg, filter, extend):
        page = max(1, self._int(pg, 1))
        try:
            url = self._category_url(tid, page, extend)
            response = self._request(url)
            videos = self._parse_cards(response.text)
            pagecount = self._page_count(response.text, page)
            limit = len(videos) or self.PAGE_SIZE
            return {
                'list': videos,
                'page': page,
                'pagecount': pagecount,
                'limit': limit,
                'total': pagecount * limit if pagecount else len(videos),
            }
        except Exception:
            return {
                'list': [],
                'page': page,
                'pagecount': page,
                'limit': self.PAGE_SIZE,
                'total': 0,
            }

    def detailContent(self, ids):
        raw_id = str(ids[0] if ids else '').strip()
        if not raw_id:
            return {'list': []}
        try:
            detail_url = self._fix_url(raw_id)
            response = self._request(detail_url)
            doc = self._doc(response.text)

            title = self._clean(
                doc('h1.product-title').eq(0).text()
                or doc('title').eq(0).text()
            )
            title = self._clean_title(title) or raw_id

            picture = ''
            img = doc('.product-header img.thumb, article img.thumb').eq(0)
            if len(img):
                picture = self._picture(
                    img.attr('src') or img.attr('data-original') or img.attr('data-src'),
                    detail_url,
                )

            directors = []
            for a in doc('.product-excerpt:contains("Directors") a').items():
                name = self._clean(a.text())
                if name:
                    directors.append(name)

            casts = []
            for a in doc('.product-excerpt:contains("Casts") a').items():
                name = self._clean(a.text())
                if name:
                    casts.append(name)

            genres = []
            for a in doc('.product-excerpt:contains("Genres") a').items():
                name = self._clean(a.text())
                if name:
                    genres.append(name)

            countries = []
            for a in doc('.product-excerpt:contains("Countries") a').items():
                name = self._clean(a.text())
                if name:
                    countries.append(name)

            summary = ''
            summary_div = doc('.product-excerpt:contains("Summary") span').eq(0)
            if len(summary_div):
                summary = self._clean(summary_div.text())

            year_match = re.search(r'\((\d{4})\)', title)
            year = year_match.group(1) if year_match else ''

            rate_text = self._clean(doc('h1.product-title .rate').eq(0).text())

            match = re.search(r'classurl\s*=\s*["\']([^"\']+)["\']', response.text)
            classurl = match.group(1) if match else ''
            match2 = re.search(r'infoid\s*=\s*(\d+)', response.text)
            infoid = match2.group(1) if match2 else ''
            match3 = re.search(r"m3u8\s*=\s*\[([^\]]*)\]", response.text)
            episodes_raw = match3.group(1) if match3 else ''
            episode_list = re.findall(r"['\"]([^'\"]+)['\"]", episodes_raw)

            from_list = []
            url_list = []

            if episode_list:
                if len(episode_list) == 1:
                    play_name = episode_list[0]
                    play_url = self._build_m3u8_url(infoid, play_name)
                    from_list.append('PPnix')
                    url_list.append('%s$%s' % (self._safe_part(play_name, '播放'), play_url))
                else:
                    eps = []
                    for ep in episode_list:
                        play_url = self._build_m3u8_url(infoid, ep)
                        ep_name = self._episode_name(ep)
                        eps.append('%s$%s' % (ep_name, play_url))
                    if eps:
                        from_list.append('PPnix')
                        url_list.append('#'.join(eps))
            else:
                if infoid:
                    play_url = self._build_m3u8_url(infoid, '1080P')
                    from_list.append('PPnix')
                    url_list.append('1080P$%s' % play_url)

            if not from_list:
                return {'list': []}

            vod = {
                'vod_id': detail_url,
                'vod_name': title,
                'vod_pic': picture,
                'type_name': ', '.join(genres) or '',
                'vod_year': year,
                'vod_area': ', '.join(countries) or '',
                'vod_actor': ', '.join(casts) or '',
                'vod_director': ', '.join(directors) or '',
                'vod_remarks': rate_text or '',
                'vod_content': summary or title,
                'vod_play_from': '$$$'.join(from_list),
                'vod_play_url': '$$$'.join(url_list),
            }
            return {'list': [vod]}
        except Exception:
            return {'list': []}

    def searchContent(self, key, quick, pg='1'):
        page = max(1, self._int(pg, 1))
        keyword = str(key or '').strip()
        if not keyword:
            return {'list': [], 'page': page, 'pagecount': page, 'limit': self.PAGE_SIZE, 'total': 0}
        try:
            encoded = quote(keyword.replace(' ', '-'), safe='')
            url = self.host + '/search/%s-------------.html' % encoded
            if page > 1:
                url = self.host + '/search/%s----------%d-.html' % (encoded, page)
            response = self._request(url)
            videos = self._parse_cards(response.text)
            pagecount = self._page_count(response.text, page)
            limit = len(videos) or self.PAGE_SIZE
            return {
                'list': videos,
                'page': page,
                'pagecount': pagecount,
                'limit': limit,
                'total': pagecount * limit if pagecount else len(videos),
            }
        except Exception:
            return {'list': [], 'page': page, 'pagecount': page, 'limit': self.PAGE_SIZE, 'total': 0}

    def searchContentDetail(self, key, quick, pg='1'):
        return None

    def playerContent(self, flag, id, vipFlags):
        value = str(id or '').strip()
        if not value:
            return {'parse': 1, 'playUrl': '', 'url': self.host + '/', 'header': self._page_headers(self.host + '/')}

        if self._is_http(value) and self.isVideoFormat(value):
            result = {
                'parse': 0,
                'playUrl': '',
                'url': value,
                'header': self._media_headers(),
            }
            if '.m3u8' in value.lower():
                result['type'] = 'm3u8'
            return result

        m3u8_url = value
        if not m3u8_url.startswith('/'):
            m3u8_url = '/' + m3u8_url
        full_url = self.host + m3u8_url

        try:
            check = self.session.get(
                full_url,
                headers=dict(self.headers, **{'Referer': self.host + '/'}),
                timeout=(5, 10),
                verify=False,
                allow_redirects=True,
            )
            ct = check.headers.get('Content-Type', '')
            if check.status_code == 200 and ('mpegurl' in ct.lower() or 'octet' in ct.lower() or check.text.strip().startswith('#EXT')):
                return {
                    'parse': 0,
                    'playUrl': '',
                    'url': full_url,
                    'header': self._media_headers(),
                    'type': 'm3u8',
                }
        except Exception:
            pass

        return {
            'parse': 1,
            'playUrl': '',
            'url': full_url,
            'header': self._page_headers(self.host + '/'),
        }

    def localProxy(self, param):
        try:
            param_type = param.get('type')
            param_url = param.get('url')
        except Exception:
            param_type = param_url = None
        if param_type != 'img' or not param_url:
            return [404, 'text/plain; charset=utf-8', b'not found']
        try:
            response = self.session.get(
                str(param_url),
                headers={
                    'User-Agent': self.headers['User-Agent'],
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                },
                timeout=(8, 20),
                verify=False,
            )
            response.raise_for_status()
            return [200, self._mime(response.content, response.headers.get('Content-Type')), response.content]
        except Exception:
            return [500, 'text/plain; charset=utf-8', b'image proxy failed']

    def _build_filter(self, tid):
        filters = []

        genre_list = self.GENRES_MOVIE if tid == 'movie' else self.GENRES_TV
        genre_values = [
            {'n': name, 'v': val}
            for name, val in genre_list
        ]
        filters.append({
            'key': 'genre',
            'name': '类型',
            'value': [{'n': '全部', 'v': ''}] + genre_values,
        })

        sort_values = [
            {'n': '默认', 'v': ''},
            {'n': '时间', 'v': 'newstime'},
            {'n': '热度', 'v': 'onclick'},
            {'n': '评分', 'v': 'rating'},
        ]
        filters.append({
            'key': 'sort',
            'name': '排序',
            'value': sort_values,
        })

        return filters

    def _category_url(self, tid, page, extend):
        slug = str(tid or '').strip()
        if slug not in ('movie', 'tv'):
            slug = 'movie'

        genre = ''
        country = ''
        year = ''
        sort = ''

        if isinstance(extend, dict):
            genre = str(extend.get('genre') or '').strip()
            country = str(extend.get('country') or '').strip()
            year = str(extend.get('year') or '').strip()
            sort_raw = str(extend.get('sort') or '').strip()
            sort = self.SORT_MAP.get(sort_raw, sort_raw)

        if genre and ' ' in genre and '%20' not in genre:
            genre = genre.replace(' ', '%20')
        if country and ' ' in country and '%20' not in country:
            country = country.replace(' ', '%20')

        path = '/%s/%s-%s-%s--%s.html' % (slug, genre, country, year, sort)

        if page > 1:
            parts = path.rsplit('.html', 1)
            base = parts[0] if parts else path.rstrip('.html')
            if base.endswith('.html'):
                base = base[:-5]
            path = '%s---%d-.html' % (base, page - 1) if not genre and not country and not year and not sort else '%s-%d.html' % (base, page - 1)

            base_no_page = '/%s/' % slug
            if genre or country or year or sort:
                path = '/%s/%s-%s-%s--%s---%d-.html' % (slug, genre, country, year, sort, page - 1)
            else:
                path = '/%s/---%d-.html' % (slug, page - 1)

        return self.host + path

    def _parse_cards(self, html_text):
        doc = self._doc(html_text)
        items = doc('.lists-content ul li, .lists-content > ul > li').items()
        if not items:
            items = doc('li').filter(lambda i, this: pq(this)('a.thumbnail').length > 0).items()

        videos = []
        seen = set()

        for li in items:
            try:
                a_thumb = li('a.thumbnail').eq(0)
                if not len(a_thumb):
                    continue
                href = str(a_thumb.attr('href') or '').strip()
                if not href or not re.search(r'/(movie|tv)/\d+\.html', href):
                    continue

                absolute = urljoin(self.host + '/', href)
                if absolute in seen:
                    continue
                seen.add(absolute)

                a_title = li('h2 a').eq(0)
                title = self._clean(
                    a_title.attr('title')
                    or a_title.text()
                    or a_thumb.attr('alt')
                )
                if not title:
                    continue

                img = li('img.thumb').eq(0)
                raw_pic = img.attr('src') or img.attr('data-original') or img.attr('data-src') or ''
                picture = self._picture(raw_pic, absolute)

                year_text = ''
                year_span = li('.countrie span').eq(0)
                if len(year_span):
                    year_text = self._clean(year_span.text())

                note_text = ''
                note_span = li('.note span').eq(0)
                if len(note_span):
                    note_text = self._clean(note_span.text())

                rate_text = self._clean(li('.rate').eq(0).text())

                remark_parts = []
                if year_text:
                    remark_parts.append(year_text)
                if note_text:
                    remark_parts.append(note_text)
                if rate_text and rate_text != '0':
                    remark_parts.append(rate_text + '分')

                videos.append({
                    'vod_id': absolute,
                    'vod_name': title,
                    'vod_pic': picture,
                    'vod_remarks': ' '.join(remark_parts) or '',
                    'vod_year': year_text or '',
                    'style': {'type': 'rect', 'ratio': 1.78},
                })
            except Exception:
                continue

        return videos

    def _build_m3u8_url(self, infoid, episode):
        infoid = str(infoid or '').strip()
        episode = str(episode or '').strip()
        if not infoid:
            return ''
        return self.host + '/info/m3u8/%s/%s.m3u8' % (infoid, episode)

    def _episode_name(self, ep):
        ep_str = str(ep or '').strip()
        if ep_str == '1080P':
            return '1080P'
        try:
            num = int(ep_str)
            return '第%02d集' % num
        except Exception:
            return ep_str or '播放'

    def _page_count(self, html_text, current):
        doc = self._doc(html_text)
        values = [max(1, self._int(current, 1))]
        for a in doc('.pagination a').items():
            href = str(a.attr('href') or '')
            match = re.search(r'---(\d+)-\.html', href)
            if match:
                values.append(self._int(match.group(1), 0) + 1)
        last_link = doc('.pagination li:last-child a, .pagination a:contains("Last")')
        if len(last_link):
            href = str(last_link.attr('href') or '')
            match = re.search(r'---(\d+)-\.html', href)
            if match:
                values.append(self._int(match.group(1), 0) + 1)
        return max(values)

    def _request(self, url, timeout=22):
        headers = dict(self.headers)
        headers['Referer'] = self.host + '/'
        response = self.session.get(
            url,
            headers=headers,
            timeout=timeout,
            verify=False,
            allow_redirects=True,
        )
        response.raise_for_status()
        if not response.encoding or response.encoding.lower() in ('iso-8859-1', 'ascii'):
            response.encoding = 'utf-8'
        return response

    def _doc(self, value):
        text = value.decode('utf-8', errors='ignore') if isinstance(value, bytes) else str(value or '')
        try:
            return pq(text)
        except Exception:
            return pq('<html></html>')

    def _picture(self, value, page_url):
        raw = html.unescape(str(value or '').strip()).strip('`"\' ')
        if not raw or 'load.gif' in raw.lower() or raw.lower().startswith('data:image'):
            return ''
        if raw.startswith('//'):
            raw = 'https:' + raw
        return urljoin(page_url or self.host + '/', raw)

    def _fix_url(self, value):
        value = html.unescape(str(value or '').strip())
        if value.startswith(('http://', 'https://')):
            return value
        if value.startswith('/'):
            return urljoin(self.host + '/', value)
        if re.search(r'/(movie|tv)/\d+\.html', value):
            return urljoin(self.host + '/', '/' + value)
        return urljoin(self.host + '/', '/' + value)

    def _media_headers(self):
        return {
            'User-Agent': self.headers['User-Agent'],
            'Accept': '*/*',
        }

    def _page_headers(self, referer=''):
        return {
            'User-Agent': self.headers['User-Agent'],
            'Accept': self.headers.get('Accept', '*/*'),
            'Referer': referer or self.host + '/',
        }

    @staticmethod
    def _is_http(value):
        return str(value or '').lower().startswith(('http://', 'https://'))

    @staticmethod
    def _safe_part(value, fallback=''):
        result = re.sub(r'[$#]+', ' ', str(value or '')).strip()
        return result or fallback

    @staticmethod
    def _clean(value):
        return re.sub(r'\s+', ' ', html.unescape(str(value or ''))).strip()

    @staticmethod
    def _clean_title(value):
        text = str(value or '')
        text = re.sub(r'\s*\d+(\.\d+)?\s*$', '', text).strip()
        text = re.sub(r'\s*PPnix.*$', '', text, flags=re.I).strip()
        return text

    @staticmethod
    def _int(value, default=0):
        try:
            return int(value)
        except Exception:
            return default

    @staticmethod
    def _mime(data, declared=''):
        if data.startswith(b'\xff\xd8\xff'):
            return 'image/jpeg'
        if data.startswith(b'\x89PNG'):
            return 'image/png'
        if data.startswith(b'GIF8'):
            return 'image/gif'
        if len(data) > 11 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return 'image/webp'
        declared = str(declared or '').split(';', 1)[0].strip()
        return declared if declared.startswith('image/') else (mimetypes.guess_type('cover.jpg')[0] or 'application/octet-stream')
