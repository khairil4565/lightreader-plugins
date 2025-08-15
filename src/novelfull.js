{
  "id": "novelfull",
  "name": "NovelFull",
  "version": "1.0.0",
  "base_url": "https://novelfull.net",
  "endpoints": {
    "latest_novels": "/latest-release-novel",
    "hot_novels": "/hot-novel",
    "search": "/search?keyword={query}",
    "novel_detail": "/{novel-slug}.html",
    "chapter_content": "/{novel-slug}/{chapter-slug}.html"
  },
  "selectors": {
    "novel_list": ".list.list-truyen .row",
    "novel_title": ".truyen-title a",
    "novel_url": ".truyen-title a",
    "novel_cover": ".book img",
    "chapter_list": ".list-chapter li a",
    "chapter_title": ".chapter-title",
    "chapter_content": "#chapter-content"
  },
  "patterns": {
    "novel_slug_regex": "https://novelfull.net/(.+?).html",
    "chapter_slug_regex": "https://novelfull.net/.+?/(.+?).html"
  }
}
