# -*- coding: utf-8 -*-
"""
top3.zgtv.online (追光影视) 爬虫
- MX Pro CMS模板
- 分类: /vodshow/{catId}---{area}--{letter}----{page}---.html
- 详情: /voddetail/{id}.html
- 播放: /vodplay/{id}-{sid}-{nid}.html -> player_aaaa JS变量
- 搜索: /vodsearch/{keyword}-------------.html
- 播放链接分两类: 直链(m3u8/mp4) 与 视频站原始URL(芒果/爱奇艺/腾讯/优酷/B站)
"""
import sys
import re
import json
from collections import defaultdict
import requests as rq
from urllib.parse import quote

sys.path.append('..')
try:
    from base.spider import Spider
except ImportError:
    class Spider:
        def fetch(self, url, headers=None, **kw):
            kw.pop('timeout', None)
            r = rq.get(url, headers=headers, timeout=15, **kw)
            r.encoding = 'utf-8'
            return r

def _(x): return x

HOST = "https://top3.zgtv.online"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# 视频站源解析器(网站当前配套的官方解析接口)
PARSE_HOST = "https://tv.time1080.xyz"

# 播放源 -> 解析接口映射 (来自 playerconfig.js) - 仅供参考
_PARSE_MAP = {
    "wsym3u8": "https://wsyzy.vip/m3u8/?url=",
    "bfzym3u8": "https://free.maccms.xyz/?url=",
    "360zy":   "https://free.maccms.xyz/?url=",
    "mtm3u8":  "https://free.maccms.xyz/?url=",
    "qq":      "https://tv.time1080.xyz/player/?url=",
    "qiyi":    "https://tv.time1080.xyz/player/?url=",
    "youku":   "https://tv.time1080.xyz/player/?url=",
    "mgtv":    "https://tv.time1080.xyz/player/?url=",
    "bilibili": "https://tv.time1080.xyz/player/?url=",
    "mjzy":    "https://mujizybf.com/m3u8/?url=",
}

# 备用解析接口 (仅保留供参考)
_BACKUP_PARSERS = [
    ("极速", "https://jx.2s0.cn/player/?url="),
    ("super", "https://super.playr.top/?url="),
    ("fongmi", "https://json.fongmi.cc/web?url="),
    ("Jn1", "https://yparse.jn1.cc/index.php?url="),
    ("PlayerJY", "https://jx.playerjy.com/?url="),
    ("冰豆", "https://bd.jx.cn/?url="),
    ("剖元", "https://www.pouyun.com/?url="),
    ("七哥", "https://jx.nnxv.cn/tv.php?url="),
    ("夜幕", "https://www.yemu.xyz/?url="),
    ("Yparse", "https://jx.yparse.com/index.php?url="),
    ("ik9", "https://yparse.ik9.cc/index.php?url="),
    ("花旗", "https://www.huaqi.live/?url="),
    ("网站z01", "https://z01.zgtv.online/player/?url="),
    ("svip2", "https://svip.qlplayer.cyou/?url="),
    ("maccms", "https://free.maccms.xyz/?url="),
    ("wsyzy", "https://wsyzy.vip/m3u8/?url="),
]

# from字段 -> 中文显示名
FROM_NAMES = {
    "qq": "腾讯",
    "qiyi": "奇异",
    "youku": "优酷",
    "mgtv": "芒果",
    "bilibili": "B站",
    "wsym3u8": "自营线路",
    "bfzym3u8": "暴风资源",
    "360zy": "无广告",
    "mtm3u8": "芒果资源",
    "mjzy": "自营蓝光",
    "dplayer": "DPlayer",
    "videojs": "VideoJS",
}

# 需要解析的from类型 (视频站链接, 需要通过解析接口解析)
NEED_PARSE_FROM = {"qq", "qiyi", "youku", "mgtv", "bilibili"}

# 主分类
CLASS_MAP = {
    "20": "电影",
    "37": "连续剧",
    "43": "动漫",
    "45": "综艺",
}


class Spider(Spider):

    def init(self, extend=""):
        self._session = rq.Session()
        self._session.headers.update({"User-Agent": UA})
        try:
            self._session.get(HOST, timeout=10)
        except:
            pass

    def getName(self):
        return "zgtv"

    def isVideoFormat(self, url):
        return ".m3u8" in url or ".mp4" in url

    def manualVideoCheck(self):
        return False

    def homeContent(self, filter=False):
        classes = []
        for tid, name in CLASS_MAP.items():
            classes.append({"type_id": tid, "type_name": name})
        return {"class": classes}

    def homeVideoContent(self):
        try:
            items = self._fetch_list(f"{HOST}/vodtype/20.html")
            return {"list": items}
        except:
            return {"list": []}

    def categoryContent(self, tid, pg=1, filter=False, extend=None):
        try:
            pn = max(int(str(pg)), 1)
            # /vodshow/{catId}--------{page}---.html
            url = f"{HOST}/vodshow/{tid}--------{pn}---.html"
            items = self._fetch_list(url)
            return {"list": items, "page": pn, "pagecount": pn + 10, "limit": 24, "total": 0}
        except:
            return {"list": [], "page": pg, "pagecount": 1, "limit": 24, "total": 0}

    def detailContent(self, ids):
        try:
            vid = str(ids[0]) if ids else ""
            if not vid:
                return {"list": []}

            url = f"{HOST}/voddetail/{vid}.html"
            r = self._get(url, timeout=15000)
            html = r.text

            # 标题
            title = self._extract(html, r'<h1[^>]*class="page-title"[^>]*>([^<]+)</h1>') or ""
            if not title:
                title = self._extract(html, r'<h1[^>]*>([^<]+)</h1>') or ""

            # 封面
            cover = self._extract(html, r'data-original="([^"]+\.(?:jpg|png|webp))"') or ""

            if not title:
                return {"list": []}

            # 播放列表 - 只匹配剧集链接(module-play-list-link类)
            all_links = re.findall(
                r'class="module-play-list-link"[^>]+href="(/vodplay/(\d+)-(\d+)-(\d+)\.html)"[^>]*>[\s\S]*?<span>([^<]+)</span>',
                html
            )
            # Fallback: 宽松匹配
            if not all_links:
                all_links = re.findall(
                    r'href="(/vodplay/(\d+)-(\d+)-(\d+)\.html)"[^>]*>[\s\S]*?<span>([^<]+)</span>',
                    html
                )

            # 播放源标签(tab名, 按出现顺序)
            heading = re.search(
                r'id="y-playList"[^>]*>([\s\S]*?)</div>\s*</div>\s*</div>', html
            )
            source_names = []
            if heading:
                source_names = re.findall(r'data-dropdown-value="([^"]+)"', heading.group(1))

            # 按 HTML 出现顺序分组 (同一播放源)
            ordered_sids = []
            by_sid = defaultdict(list)
            for match in all_links:
                if len(match) == 5:
                    href, v, sid, nid, name = match
                    if v == vid:
                        if sid not in by_sid:
                            ordered_sids.append(sid)
                        by_sid[sid].append((int(nid), name.strip(), href))

            pf_list = []
            pu_list = []

            for idx, sid in enumerate(ordered_sids):
                eps = sorted(by_sid[sid])

                # 获取该源的from字段(只请求第一集)
                sid_from = self._get_from_source(vid, sid)

                # 命名: 优先网站tab名(按顺序对应), 否则用from映射名
                if idx < len(source_names):
                    friendly_name = source_names[idx]
                else:
                    friendly_name = FROM_NAMES.get(sid_from, f"线路{idx + 1}")

                # 直链源与视频站源都保留, from通过|传给playerContent
                ep_list = []
                for nid, name, href in eps:
                    ep_list.append(f"{name}${href}|{sid_from}")
                if ep_list:
                    pf_list.append(friendly_name)
                    pu_list.append("#".join(ep_list))

            if not pf_list:
                return {"list": []}

            vod = {
                "vod_id": vid,
                "vod_name": title,
                "vod_pic": cover,
                "vod_play_from": "$$$".join(pf_list),
                "vod_play_url": "$$$".join(pu_list),
            }
            return {"list": [vod]}
        except:
            return {"list": []}

    def searchContent(self, key, quick=False, pg=1):
        try:
            pn = max(int(str(pg)), 1)
            url = f"{HOST}/vodsearch/{quote(key)}-------------.html"
            items = self._fetch_list(url)
            return {"list": items, "page": pn}
        except:
            return {"list": [], "page": 1}

    def playerContent(self, flag, id, vipFlags=None):
        url = str(id) if id else str(flag)
        if not url:
            return {"url": ""}
        if "$" in url:
            parts = url.split("$", 1)
            url = parts[1]

        # m3u8/mp4直链直接播
        if url.startswith("http") and (".m3u8" in url or ".mp4" in url):
            return {"url": url}

        # 播放页路径 /vodplay/{vid}-{sid}-{nid}.html|from
        from_src = ""
        parts = url.split("|")
        if len(parts) == 2:
            url = parts[0]
            from_src = parts[1]

        if url.startswith("/vodplay/"):
            play_data = self._extract_player_data(url)
            if play_data:
                raw_url = play_data.get("url", "")
                # from字段优先取player_aaaa里的值
                pfrom = play_data.get("from", "") or from_src

                # 如果已经是m3u8/mp4直链, 直接播放
                if raw_url and (".m3u8" in raw_url or ".mp4" in raw_url):
                    return {"url": raw_url}

                # 视频站链接(qq/youku等): 走网站官方解析器
                if raw_url and raw_url.startswith("http"):
                    if pfrom in NEED_PARSE_FROM:
                        return {
                            "url": f"{PARSE_HOST}/player/?url={quote(raw_url, safe='')}",
                            "header": {"User-Agent": UA, "Referer": HOST},
                        }
                    # 其他http链接, 让壳子自行解析
                    return {"url": raw_url, "parse": 1, "header": {"User-Agent": UA}}
            return {"url": ""}

        return {"url": url}

    def _get(self, url, timeout=20):
        r = self._session.get(url, timeout=timeout)
        # MX Pro CMS可能返回不同编码
        if r.apparent_encoding:
            r.encoding = r.apparent_encoding
        return r

    def _extract(self, text, pattern):
        m = re.search(pattern, text)
        return m.group(1) if m else ""

    def _fetch_list(self, url):
        """从HTML抓取影片列表"""
        r = self._get(url, timeout=15000)
        html = r.text if hasattr(r, 'text') else str(r)

        items = []
        seen = set()

        # Pattern1: MX Pro - <a href="/voddetail/{id}.html" title="名称">...<img data-original="封面">
        pattern1 = re.compile(
            r'<a\s+href="/voddetail/(\d+)\.html"[^>]+title="([^"]+)"'
            r'[\s\S]*?'
            r'<img[^>]+data-original="([^"]+\.(?:jpg|png|webp))"'
        )
        for vid, title, cover in pattern1.findall(html):
            if vid in seen:
                continue
            seen.add(vid)
            items.append({
                "vod_id": vid,
                "vod_name": title.strip(),
                "vod_pic": cover,
                "vod_remarks": "",
            })

        # Pattern1b: 搜索结果 - data-original在alt前面
        if not items:
            pattern1b = re.compile(
                r'<a\s+href="/voddetail/(\d+)\.html"[^>]*>'
                r'[\s\S]*?'
                r'<img[^>]+data-original="([^"]+\.(?:jpg|png|webp))"[^>]+alt="([^"]+)"'
            )
            for vid, cover, title in pattern1b.findall(html):
                if vid in seen:
                    continue
                seen.add(vid)
                items.append({
                    "vod_id": vid,
                    "vod_name": title.strip(),
                    "vod_pic": cover,
                    "vod_remarks": "",
                })

        # Pattern1c: alt在data-original前面
        if not items:
            pattern1c = re.compile(
                r'<a\s+href="/voddetail/(\d+)\.html"[^>]*>'
                r'[\s\S]*?'
                r'<img[^>]+alt="([^"]+)"[^>]+data-original="([^"]+\.(?:jpg|png|webp))"'
            )
            for vid, title, cover in pattern1c.findall(html):
                if vid in seen:
                    continue
                seen.add(vid)
                items.append({
                    "vod_id": vid,
                    "vod_name": title.strip(),
                    "vod_pic": cover,
                    "vod_remarks": "",
                })

        # Pattern2: 首页/推荐页 - <a href="/vodplay/{id}-1-1.html" title="名称">...<img data-original="封面">
        if not items:
            pattern2 = re.compile(
                r'<a\s+href="/vodplay/(\d+)-\d+-\d+\.html"[^>]+title="([^"]+)"'
                r'[\s\S]*?'
                r'<img[^>]+data-original="([^"]+\.(?:jpg|png|webp))"'
            )
            for vid, title, cover in pattern2.findall(html):
                if vid in seen:
                    continue
                seen.add(vid)
                items.append({
                    "vod_id": vid,
                    "vod_name": title.strip(),
                    "vod_pic": cover,
                    "vod_remarks": "",
                })

        # Pattern3: 备用 - 任何含title和data-original的a标签
        if not items:
            pattern3 = re.compile(
                r'<a[^>]+title="([^"]+)"[^>]*>'
                r'[\s\S]*?'
                r'<img[^>]+data-original="([^"]+\.(?:jpg|png|webp))"'
            )
            for title, cover in pattern3.findall(html):
                items.append({
                    "vod_id": "",
                    "vod_name": title.strip(),
                    "vod_pic": cover,
                    "vod_remarks": "",
                })
        return items

    def _extract_player_url_from_path(self, path):
        """从播放页路径提取真实m3u8 URL"""
        try:
            url = f"{HOST}{path}"
            r = self._get(url, timeout=15000)
            html = r.text
            m = re.search(r'player_aaaa\s*=\s*(\{[^}]+})', html)
            if m:
                data = json.loads(m.group(1))
                return data.get("url", "")
        except:
            pass
        return ""

    def _extract_player_data(self, path):
        """从播放页路径提取完整播放数据(url, from等)"""
        try:
            url = f"{HOST}{path}"
            r = self._get(url, timeout=15000)
            html = r.text
            m = re.search(r'player_aaaa\s*=\s*(\{[^}]+})', html)
            if m:
                data = json.loads(m.group(1))
                return data
        except:
            pass
        return None

    def _get_from_source(self, vid, sid):
        """获取某播放源的from字段(播放源类型)"""
        try:
            url = f"{HOST}/vodplay/{vid}-{sid}-1.html"
            r = self._get(url, timeout=10000)
            html = r.text
            m = re.search(r'player_aaaa\s*=\s*(\{[^}]+})', html)
            if m:
                data = json.loads(m.group(1))
                return data.get("from", "")
        except:
            pass
        return ""

    def _extract_player_url(self, vid, sid, nid):
        """从播放页提取player_aaaa中的URL"""
        try:
            url = f"{HOST}/vodplay/{vid}-{sid}-{nid}.html"
            r = self._get(url, timeout=15000)
            html = r.text

            # 匹配 player_aaaa={"url":"..."}
            m = re.search(r'player_aaaa\s*=\s*(\{[^}]+})', html, re.DOTALL)
            if m:
                data = json.loads(m.group(1))
                play_url = data.get("url", "")
                return play_url
        except:
            pass
        return ""

    def localProxy(self, param):
        pass
