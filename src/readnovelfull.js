// @id readnovelfull
// @name ReadNovelFull
// @version 1.0.1
// @description Read novels from ReadNovelFull.com with complete chapter loading and cover image support
// @author khairil4565
// @website https://readnovelfull.com

class ReadNovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://readnovelfull.com';
        this.maxConcurrentRequests = 3;
    }

    async searchNovels(query) {
        console.log(`ReadNovelFull: Searching for: ${query}`);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/novel-list/most-popular`;
                    break;
                case 'latest':
                    url = `${this.baseURL}/novel-list/latest-release-novel`;
                    break;
                case 'hot':
                    url = `${this.baseURL}/novel-list/hot-novel`;
                    break;
                case 'completed':
                    url = `${this.baseURL}/novel-list/completed-novel`;
                    break;
                default:
                    url = `${this.baseURL}/search?keyword=${encodeURIComponent(query)}`;
            }
            
            console.log(`ReadNovelFull: Fetching from URL: ${url}`);
            const html = await fetch(url);
            
            return this.parseNovelList(html, query);
            
        } catch (error) {
            console.log(`ReadNovelFull: Error searching novels: ${error}`);
            return [];
        }
    }

    async parseNovelList(html, queryType) {
        try {
            console.log(`ReadNovelFull: Starting to parse novel list for query: ${queryType}`);
            console.log(`ReadNovelFull: HTML length: ${html ? html.length : 0} characters`);
            
            // First, let's see what HTML structure we're dealing with
            if (html && html.length > 0) {
                console.log(`ReadNovelFull: HTML preview: ${html.substring(0, 1000)}`);
            }
            
            // Try multiple selector patterns for ReadNovelFull
            const selectorPatterns = [
                '.list .row',
                '.novel-list .row', 
                '.list-novel .row',
                '.col-novel-main .col-novel-item',
                '.list-group .list-group-item',
                '.novel-item',
                '.book-item',
                '.row .col-6',
                '.row .col-4',
                '.row .col-3',
                '.item',
                'tr'  // Table rows as fallback
            ];
            
            let novelElements = null;
            let workingSelector = '';
            
            for (const selector of selectorPatterns) {
                console.log(`ReadNovelFull: Trying selector: ${selector}`);
                novelElements = parseHTML(html, selector);
                
                if (novelElements && novelElements.length > 0) {
                    workingSelector = selector;
                    console.log(`ReadNovelFull: ✅ Found ${novelElements.length} elements with selector: ${selector}`);
                    break;
                } else {
                    console.log(`ReadNovelFull: ❌ No elements found with selector: ${selector}`);
                }
            }
            
            if (!novelElements || novelElements.length === 0) {
                console.log(`ReadNovelFull: ❌ No novel elements found with any selector`);
                console.log(`ReadNovelFull: HTML sample for debugging: ${html.substring(0, 2000)}`);
                return [];
            }
            
            console.log(`ReadNovelFull: Using working selector: ${workingSelector}`);
            console.log(`ReadNovelFull: Processing ${Math.min(novelElements.length, 10)} elements`);
            
            const novels = [];
            const elementsToProcess = Math.min(novelElements.length, 10);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    console.log(`ReadNovelFull: Processing element ${i + 1}/${elementsToProcess}`);
                    console.log(`ReadNovelFull: Element HTML: ${element.html ? element.html.substring(0, 500) : 'No HTML'}`);
                    
                    // Try multiple title selectors
                    const titleSelectors = [
                        'a[href*="/novel/"]',
                        '.novel-title a',
                        '.title a', 
                        'h3 a', 
                        'h4 a',
                        'h5 a',
                        '.book-title a',
                        'a',
                        'td:first-child a'  // For table layouts
                    ];
                    
                    let titleElement = null;
                    let usedTitleSelector = '';
                    
                    for (const titleSel of titleSelectors) {
                        const titleElements = parseHTML(element.html, titleSel);
                        if (titleElements && titleElements.length > 0) {
                            titleElement = titleElements[0];
                            usedTitleSelector = titleSel;
                            console.log(`ReadNovelFull: ✅ Found title with selector: ${titleSel}`);
                            break;
                        }
                    }
                    
                    if (!titleElement) {
                        console.log(`ReadNovelFull: ❌ No title found in element ${i}`);
                        continue;
                    }
                    
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    console.log(`ReadNovelFull: Found novel: "${title}"`);
                    console.log(`ReadNovelFull: Novel URL: ${novelURL}`);
                    
                    if (!title || !novelURL || title.length < 2) {
                        console.log(`ReadNovelFull: ❌ Skipping invalid novel: title="${title}", url="${novelURL}"`);
                        continue;
                    }
                    
                    // Try to find author
                    let author = null;
                    const authorSelectors = ['.author', '.novel-author', '.book-author', '.writer', 'td:nth-child(2)'];
                    
                    for (const authorSel of authorSelectors) {
                        const authorElements = parseHTML(element.html, authorSel);
                        if (authorElements && authorElements.length > 0) {
                            const authorElement = authorElements[0];
                            const authorText = authorElement.text || authorElement.textContent || authorElement.innerText;
                            
                            if (authorText && authorText.trim() && authorText.trim().length > 1) {
                                author = authorText.trim()
                                    .replace(/^Author:\s*/i, '')
                                    .replace(/^\s*📝\s*/, '')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                                console.log(`ReadNovelFull: Found author: ${author}`);
                                break;
                            }
                        }
                    }
                    
                    // Try to find cover image
                    let coverURL = null;
                    const coverSelectors = [
                        'img[src*="cover"]',
                        'img[src*="thumb"]', 
                        '.novel-cover img',
                        '.cover img', 
                        '.book img', 
                        '.book-cover img',
                        'img'
                    ];
                    
                    for (const coverSel of coverSelectors) {
                        const coverElements = parseHTML(element.html, coverSel);
                        if (coverElements && coverElements.length > 0) {
                            for (const coverElement of coverElements) {
                                const src = coverElement.src || coverElement['data-src'] || coverElement['data-original'];
                                if (src && src.length > 10 && (src.includes('.jpg') || src.includes('.png') || src.includes('.webp'))) {
                                    coverURL = this.resolveURL(src);
                                    console.log(`ReadNovelFull: Found cover: ${coverURL}`);
                                    break;
                                }
                            }
                            if (coverURL) break;
                        }
                    }
                    
                    const novel = {
                        id: `readnovelfull_${Date.now()}_${i}`,
                        title: title,
                        author: author,
                        synopsis: null,
                        coverImageURL: coverURL,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    console.log(`ReadNovelFull: ✅ Successfully added novel: "${title}" by ${author || 'Unknown'}`);
                    
                } catch (error) {
                    console.log(`ReadNovelFull: ❌ Error parsing element ${i}: ${error}`);
                }
            }
            
            console.log(`ReadNovelFull: ✅ Successfully parsed ${novels.length} novels total`);
            return novels;
            
        } catch (error) {
            console.log(`ReadNovelFull: ❌ Error in parseNovelList: ${error}`);
            return [];
        }
    }

    resolveURL(url) {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return this.baseURL + url;
        return url;
    }

    async fetchNovelDetails(novelURL) {
        try {
            console.log(`ReadNovelFull: Fetching novel details from: ${novelURL}`);
            const html = await fetch(novelURL);
            
            // For now, return basic structure - we'll implement full details later
            const novel = {
                id: `readnovelfull_${Date.now()}`,
                title: "Novel from ReadNovelFull",
                author: null,
                synopsis: "Synopsis not implemented yet",
                coverImageURL: null,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            const result = {
                novel: novel,
                chapters: [],
                totalChapters: 0,
                lastUpdated: new Date()
            };
            
            return result;
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching novel details: ${error}`);
            throw error;
        }
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`ReadNovelFull: Fetching chapter content from: ${chapterURL}`);
            return "Chapter content loading not implemented yet for ReadNovelFull";
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }
}
