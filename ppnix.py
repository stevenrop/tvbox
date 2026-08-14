# -*- coding: utf-8 -*-

import sys
import re
import html
from urllib.parse import quote, urljoin

import requests
import urllib3
from lxml import etree

sys.path.append('..')
from base.spider import Spider

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class Spider(Spider):

    HOST = 'https://www.ppnix.com'
    LANG = '/cn'
    PAGE_SIZE = 36

    CLASSES = (
        ('电影', 'movie'),
        ('电视剧', 'tv'),
    )

    GENRES_MOVIE = (
        ('动作', '动作'),
        ('喜剧', '喜剧'),
        ('剧情', '剧情'),
        ('惊悚', '惊悚'),
        ('爱情', '爱情'),
        ('犯罪', '犯罪'),
        ('冒险', '冒险'),
        ('恐怖', '恐怖'),
        ('悬疑', '悬疑'),
        ('奇幻', '奇幻'),
        ('科幻', '科幻'),
        ('家庭', '家庭'),
        ('动画', '动画'),
        ('传记', '传记'),
        ('历史', '历史'),
        ('战争', '战争'),
        ('音乐', '音乐'),
        ('运动', '运动'),
        ('歌舞', '歌舞'),
        ('纪录', '纪录'),
        ('西部', '西部'),
        ('短片', '短片'),
    )

    GENRES_TV = (
        ('剧情', '剧情'),
        ('惊悚', '惊悚'),
        ('悬疑', '悬疑'),
        ('犯罪', '犯罪'),
        ('动作', '动作'),
        ('喜剧', '喜剧'),
        ('爱情', '爱情'),
        ('奇幻', '奇幻'),
        ('科幻', '科幻'),
        ('冒险', '冒险'),
        ('恐怖', '恐怖'),
        ('动画', '动画'),
        ('历史', '历史'),
        ('战争', '战争'),
        ('家庭', '家庭'),
        ('传记', '传记'),
        ('西部', '西部'),
        ('短片', '短片'),
        ('运动', '运动'),
        ('真人秀', '真人秀'),
        ('音乐', '音乐'),
        ('纪录', '纪录'),
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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
            response = self._request(self.host + self.LANG + '/')
            videos = self._parse_cards(response.text)
            return {'list': videos}
        except Exception:
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
            tree = self._tree(response.text)

            title = self._clean(self._xpath(tree, '//h1[contains(@class,"product-title")]/text()'))
            title = self._clean_title(title) or raw_id

            picture = ''
            img_src = self._xpath(tree, '//div[contains(@class,"product-header")]//img[contains(@class,"thumb")]/@src')
            if not img_src:
                img_src = self._xpath(tree, '//article//img[contains(@class,"thumb")]/@src')
            if img_src:
                picture = self._picture(img_src, detail_url)

            directors = self._xpath_all(tree, '//div[contains(@class,"product-excerpt")][contains(.,"导演") or contains(.,"Directors")]//a/text()')
            casts = self._xpath_all(tree, '//div[contains(@class,"product-excerpt")][contains(.,"主演") or contains(.,"Casts")]//a/text()')
            genres = self._xpath_all(tree, '//div[contains(@class,"product-excerpt")][contains(.,"类型") or contains(.,"Genres")]//a/text()')
            countries = self._xpath_all(tree, '//div[contains(@class,"product-excerpt")][contains(.,"国家") or contains(.,"Countries")]//a/text()')
            summary = self._clean(self._xpath(tree, '//div[contains(@class,"product-excerpt")][contains(.,"简介") or contains(.,"Summary")]//span/text()'))

            year_match = re.search(r'\((\d{4})\)', title)
            year = year_match.group(1) if year_match else ''
            rate_text = self._clean(self._xpath(tree, '//h1[contains(@class,"product-title")]//span[contains(@class,"rate")]/text()'))

            match_infoid = re.search(r'infoid\s*=\s*(\d+)', response.text)
            infoid = match_infoid.group(1) if match_infoid else ''
            match_m3u8 = re.search(r"m3u8\s*=\s*\[([^\]]*)\]", response.text)
            episodes_raw = match_m3u8.group(1) if match_m3u8 else ''
            episode_list = re.findall(r"['\"]([^'\"]+)['\"]", episodes_raw)

            from_list = []
            url_list = []

            proxy_base = self._proxy_base()

            if episode_list:
                if len(episode_list) == 1:
                    play_name = episode_list[0]
                    play_url = self._proxy_m3u8_url(infoid, play_name, proxy_base)
                    from_list.append('PPnix')
                    url_list.append('%s$%s' % (self._safe_part(play_name, '播放'), play_url))
                else:
                    eps = []
                    for ep in episode_list:
                        play_url = self._proxy_m3u8_url(infoid, ep, proxy_base)
                        ep_name = self._episode_name(ep)
                        eps.append('%s$%s' % (ep_name, play_url))
                    if eps:
                        from_list.append('PPnix')
                        url_list.append('#'.join(eps))
            else:
                if infoid:
                    play_url = self._proxy_m3u8_url(infoid, '1080P', proxy_base)
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
            if page > 1:
                url = self.host + self.LANG + '/search/%s---%d-.html' % (encoded, page)
            else:
                url = self.host + self.LANG + '/search/%s--.html' % encoded
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

    def playerContent(self, flag, id, vipFlags):
        value = str(id or '').strip()
        if not value:
            return {'parse': 1, 'playUrl': '', 'url': self.host + '/', 'header': ''}
        if self._is_http(value):
            result = {
                'parse': 0,
                'playUrl': '',
                'url': value,
                'header': '',
            }
            if '.m3u8' in value.lower():
                result['type'] = 'm3u8'
            return result
        # 本地代理 URL（如 /m3u8/xxx/xxx.m3u8）
        if value.startswith('/'):
            return {
                'parse': 0,
                'playUrl': '',
                'url': value,
                'header': '',
                'type': 'm3u8',
            }
        return {
            'parse': 0,
            'playUrl': '',
            'url': value,
            'header': '',
            'type': 'm3u8',
        }

    def localProxy(self, param):
        try:
            path = param.get('path') or ''
            if not path:
                return [404, 'text/plain; charset=utf-8', b'not found']
            if path.startswith('/m3u8/'):
                return self._serve_m3u8(path)
            if path.startswith('/key'):
                return self._serve_key(path)
            return [404, 'text/plain; charset=utf-8', b'unknown']
        except Exception:
            return [500, 'text/plain; charset=utf-8', b'proxy error']

    def _serve_m3u8(self, path):
        parts = path.strip('/').split('/')
        if len(parts) < 3:
            return [404, 'text/plain', b'bad path']
        infoid = parts[1]
        episode = parts[2]
        if episode.endswith('.m3u8'):
            episode = episode[:-5]

        m3u8_url = self.host + self.LANG + '/info/m3u8/%s/%s.m3u8' % (infoid, episode)
        resp = self.session.get(
            m3u8_url,
            headers={
                'User-Agent': self.headers['User-Agent'],
                'Referer': self.host + self.LANG + '/',
                'Accept': '*/*',
            },
            timeout=15,
            verify=False,
        )
        if resp.status_code != 200:
            return [resp.status_code, 'text/plain', b'upstream error']

        proxy_base = self._proxy_base().rstrip('/')
        key_url = '%s&path=/key' % proxy_base if '?' in proxy_base else '%s/key' % proxy_base
        content = resp.text
        content = re.sub(
            r'URI=["\']?[^"\'>]*["\']?',
            'URI="%s"' % key_url,
            content,
        )
        # 将相对分段 URL 解析为绝对 URL，确保 TVBox 能正确加载
        base_url = m3u8_url.rsplit('/', 1)[0] + '/'
        lines = []
        for line in content.split('\n'):
            line = line.strip()
            if line and not line.startswith('#') and not self._is_http(line):
                line = urljoin(base_url, line)
            lines.append(line)
        content = '\n'.join(lines)
        return [200, 'application/vnd.apple.mpegurl', content.encode('utf-8')]

    def _serve_key(self, path):
        try:
            resp = self.session.get(
                self.host + self.LANG + '/info/m3u8/key',
                headers={
                    'User-Agent': self.headers['User-Agent'],
                    'Referer': self.host + self.LANG + '/',
                    'Accept': '*/*',
                },
                timeout=10,
                verify=False,
            )
            if resp.status_code == 200 and resp.content:
                key_hex = resp.text.strip()
                if len(key_hex) == 32:
                    try:
                        key_bytes = bytes.fromhex(key_hex)
                        return [200, 'application/octet-stream', key_bytes]
                    except Exception:
                        pass
                if len(resp.content) == 16:
                    return [200, 'application/octet-stream', resp.content]
                return [200, 'application/octet-stream', resp.content]
        except Exception:
            pass
        return [500, 'text/plain', b'key error']

    def _proxy_base(self):
        try:
            return self.clients.getLocalProxyUrl()
        except Exception:
            return 'http://127.0.0.1:0/proxy'

    def _proxy_m3u8_url(self, infoid, episode, proxy_base):
        base = proxy_base.rstrip('/')
        if '?' in base:
            return '%s&path=/m3u8/%s/%s.m3u8' % (base, infoid, episode)
        return '%s/m3u8/%s/%s.m3u8' % (base, infoid, episode)

    def _build_filter(self, tid):
        filters = []
        genre_list = self.GENRES_MOVIE if tid == 'movie' else self.GENRES_TV
        genre_values = [{'n': name, 'v': val} for name, val in genre_list]
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
        if page > 1:
            if genre or country or year or sort:
                path = '/%s/%s/%s-%s-%s--%s---%d-.html' % (self.LANG, slug, genre, country, year, sort, page - 1)
            else:
                path = '/%s/%s/---%d-.html' % (self.LANG, slug, page - 1)
        else:
            path = '/%s/%s/%s-%s-%s--%s.html' % (self.LANG, slug, genre, country, year, sort)
        return self.host + path

    def _parse_cards(self, html_text):
        tree = self._tree(html_text)
        items = tree.xpath('//div[contains(@class,"lists-content")]//ul//li')
        if not items:
            items = tree.xpath('//li[.//a[contains(@class,"thumbnail")]]')
        videos = []
        seen = set()
        for li in items:
            try:
                a_thumb = li.xpath('.//a[contains(@class,"thumbnail")]')
                if not a_thumb:
                    continue
                href = str(a_thumb[0].get('href') or '').strip()
                if not href or not re.search(r'/(movie|tv)/\d+\.html', href):
                    continue
                absolute = urljoin(self.host + '/', href)
                if '/cn/' not in absolute and '/tw/' not in absolute:
                    absolute = absolute.replace(self.host + '/', self.host + self.LANG + '/')
                if absolute in seen:
                    continue
                seen.add(absolute)
                a_title = li.xpath('.//h2//a')
                title = ''
                if a_title:
                    title = self._clean(a_title[0].get('title') or a_title[0].text or a_thumb[0].get('alt') or '')
                if not title:
                    continue
                img = li.xpath('.//img[contains(@class,"thumb")]')
                raw_pic = ''
                if img:
                    raw_pic = img[0].get('src') or img[0].get('data-original') or img[0].get('data-src') or ''
                picture = self._picture(raw_pic, absolute)
                year_text = self._clean(self._xpath(li, './/span[contains(@class,"countrie")]//span/text()'))
                note_text = self._clean(self._xpath(li, './/span[contains(@class,"note")]//span/text()'))
                rate_text = self._clean(self._xpath(li, './/span[contains(@class,"rate")]/text()'))
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
        tree = self._tree(html_text)
        values = [max(1, self._int(current, 1))]
        for a in tree.xpath('//div[contains(@class,"pagination")]//a'):
            href = str(a.get('href') or '')
            match = re.search(r'---(\d+)-\.html', href)
            if match:
                values.append(self._int(match.group(1), 0) + 1)
        return max(values)

    def _request(self, url, timeout=22):
        headers = dict(self.headers)
        headers['Referer'] = self.host + self.LANG + '/'
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

    def _tree(self, value):
        text = value.decode('utf-8', errors='ignore') if isinstance(value, bytes) else str(value or '')
        try:
            return etree.HTML(text)
        except Exception:
            return etree.HTML('<html></html>')

    def _xpath(self, node, path):
        try:
            result = node.xpath(path)
            if result:
                val = result[0] if isinstance(result, list) else result
                if isinstance(val, bytes):
                    return val.decode('utf-8', errors='ignore')
                return str(val)
        except Exception:
            pass
        return ''

    def _xpath_all(self, node, path):
        try:
            result = node.xpath(path)
            vals = []
            for x in result:
                if isinstance(x, bytes):
                    x = x.decode('utf-8', errors='ignore')
                s = self._clean(str(x))
                if s:
                    vals.append(s)
            return vals
        except Exception:
            return []

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
            if '/cn/' not in value and '/tw/' not in value and re.search(r'/(movie|tv)/\d+\.html', value):
                value = value.replace(self.host + '/', self.host + self.LANG + '/')
            return value
        if value.startswith('/cn/') or value.startswith('/tw/'):
            return urljoin(self.host + '/', value)
        if value.startswith('/'):
            return urljoin(self.host + '/', self.LANG + value)
        return urljoin(self.host + '/', self.LANG + '/' + value)

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
