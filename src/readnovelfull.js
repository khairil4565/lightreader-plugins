// @id readnovelfull
// @name ReadNovelFull
// @version 1.0.2
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
            
            console.log(`ReadNovelFull: HTML length: ${html ? html.length : 0} characters`);
            console.log(`ReadNovelFull: HTML preview: ${html.substring(0, 1000)}`);
            
            // Parse basic novel info
            let title = "Unknown Title";
            let author = null;
            let synopsis = "No synopsis available";
            let coverURL = null;
            
            // Try to extract title
            const titleSelectors = [
                '.novel-detail-title h1',
                '.novel-title h1', 
                'h1.title',
                'h1',
                '.book-title',
                '.title'
            ];
            
            for (const selector of titleSelectors) {
                const titleElements = parseHTML(html, selector);
                if (titleElements && titleElements.length > 0 && titleElements[0].text) {
                    title = titleElements[0].text.trim();
                    console.log(`ReadNovelFull: Found title with ${selector}: ${title}`);
                    break;
                }
            }
            
            // Try to extract author
            const authorSelectors = [
                '.novel-detail-author a',
                '.author a', 
                '.info-author a',
                '.book-author',
                '.writer'
            ];
            
            for (const selector of authorSelectors) {
                const authorElements = parseHTML(html, selector);
                if (authorElements && authorElements.length > 0 && authorElements[0].text) {
                    author = authorElements[0].text.trim();
                    console.log(`ReadNovelFull: Found author with ${selector}: ${author}`);
                    break;
                }
            }
            
            // Try to extract synopsis
            const synopsisSelectors = [
                '.novel-detail-body',
                '.summary', 
                '.description',
                '.synopsis',
                '.novel-desc'
            ];
            
            for (const selector of synopsisSelectors) {
                const synopsisElements = parseHTML(html, selector);
                if (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) {
                    synopsis = synopsisElements[0].text.trim();
                    console.log(`ReadNovelFull: Found synopsis with ${selector}: ${synopsis.substring(0, 100)}...`);
                    break;
                }
            }
            
            // Try to extract cover image
            const coverSelectors = [
                '.novel-detail-cover img',
                '.novel-cover img', 
                '.cover img',
                '.book-cover img',
                'img[src*="cover"]',
                'img[src*="thumb"]'
            ];
            
            for (const selector of coverSelectors) {
                const coverElements = parseHTML(html, selector);
                if (coverElements && coverElements.length > 0) {
                    const coverElement = coverElements[0];
                    const src = coverElement.src || coverElement['data-src'] || coverElement['data-original'];
                    if (src) {
                        coverURL = this.resolveURL(src);
                        console.log(`ReadNovelFull: Found cover with ${selector}: ${coverURL}`);
                        break;
                    }
                }
            }
            
            // Parse chapter list
            console.log(`ReadNovelFull: Starting to parse chapter list...`);
            const chapters = await this.parseChapterListFromNovelPage(html, novelURL);
            
            const novel = {
                id: `readnovelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log(`ReadNovelFull: Novel details parsed:`);
            console.log(`  Title: ${title}`);
            console.log(`  Author: ${author}`);
            console.log(`  Cover: ${coverURL ? 'Found' : 'Not found'}`);
            console.log(`  Chapters: ${chapters.length}`);
            
            const result = {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
            console.log(`ReadNovelFull: Returning novel detail with ${chapters.length} chapters`);
            return result;
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching novel details: ${error}`);
            throw error;
        }
    }

    async parseChapterListFromNovelPage(html, novelURL) {
        try {
            console.log(`ReadNovelFull: Parsing chapter list from novel page`);
            
            // Try different selectors for chapter lists
            const chapterSelectors = [
                '.chapter-list .row a',
                '.list-chapter a', 
                '.chapter-item a',
                '#chapter-list a',
                '.chapters a',
                '.chapter-link',
                'a[href*="/chapter/"]',
                'a[href*="/ch-"]',
                '.table a',
                'table a'
            ];
            
            let chapterElements = null;
            let workingSelector = '';
            
            for (const selector of chapterSelectors) {
                console.log(`ReadNovelFull: Trying chapter selector: ${selector}`);
                chapterElements = parseHTML(html, selector);
                
                if (chapterElements && chapterElements.length > 0) {
                    workingSelector = selector;
                    console.log(`ReadNovelFull: ✅ Found ${chapterElements.length} chapters with selector: ${selector}`);
                    break;
                } else {
                    console.log(`ReadNovelFull: ❌ No chapters found with selector: ${selector}`);
                }
            }
            
            if (!chapterElements || chapterElements.length === 0) {
                console.log(`ReadNovelFull: ❌ No chapters found with any selector`);
                console.log(`ReadNovelFull: HTML sample for chapter debugging: ${html.substring(1000, 3000)}`);
                return [];
            }
            
            const chapters = [];
            console.log(`ReadNovelFull: Processing ${chapterElements.length} chapter elements`);
            
            for (let i = 0; i < chapterElements.length; i++) {
                try {
                    const element = chapterElements[i];
                    
                    const chapterTitle = element.text ? element.text.trim() : `Chapter ${i + 1}`;
                    const chapterURL = this.resolveURL(element.href);
                    
                    if (!chapterURL) {
                        console.log(`ReadNovelFull: Skipping chapter ${i}: no URL`);
                        continue;
                    }
                    
                    // Extract chapter number from title or URL
                    let chapterNumber = i + 1;
                    
                    // Try to extract chapter number from title first
                    const titleNumberMatch = chapterTitle.match(/Chapter\s+(\d+)/i);
                    if (titleNumberMatch) {
                        chapterNumber = parseInt(titleNumberMatch[1]);
                    } else {
                        // Try URL
                        const urlNumberMatch = chapterURL.match(/chapter[-_]?(\d+)|ch[-_](\d+)/i);
                        if (urlNumberMatch) {
                            chapterNumber = parseInt(urlNumberMatch[1] || urlNumberMatch[2]);
                        }
                    }
                    
                    const chapter = {
                        id: `readnovelfull_chapter_${Date.now()}_${i}_${chapterNumber}`,
                        title: chapterTitle,
                        novelId: novelURL,
                        chapterNumber: chapterNumber,
                        url: chapterURL,
                        content: null,
                        isDownloaded: false
                    };
                    
                    chapters.push(chapter);
                    
                    if (i < 5) {
                        console.log(`ReadNovelFull: Chapter ${i + 1}: "${chapterTitle}" -> ${chapterURL}`);
                    }
                    
                } catch (error) {
                    console.log(`ReadNovelFull: Error parsing chapter ${i}: ${error}`);
                }
            }
            
            console.log(`ReadNovelFull: ✅ Successfully parsed ${chapters.length} chapters`);
            return chapters;
            
        } catch (error) {
            console.log(`ReadNovelFull: Error parsing chapter list: ${error}`);
            return [];
        }
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`ReadNovelFull: Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            console.log(`ReadNovelFull: Chapter HTML length: ${html ? html.length : 0} characters`);
            
            // ReadNovelFull chapter content selectors
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content',
                '.chapter-body',
                '#content',
                '.content',
                '.novel-content',
                '.reading-content',
                '.text-left'
            ];
            
            for (const selector of contentSelectors) {
                console.log(`ReadNovelFull: Trying content selector: ${selector}`);
                const contentElements = parseHTML(html, selector);
                
                if (contentElements && contentElements.length > 0) {
                    let content = contentElements[0].html || contentElements[0].text;
                    
                    if (content && content.length > 100) {
                        console.log(`ReadNovelFull: ✅ Found content with ${selector}, length: ${content.length}`);
                        
                        // Process HTML content to preserve paragraphs
                        content = this.processChapterContent(content);
                        console.log(`ReadNovelFull: ✅ Processed content, final length: ${content.length}`);
                        return content;
                    }
                }
            }
            
            console.log(`ReadNovelFull: ❌ No chapter content found`);
            console.log(`ReadNovelFull: Chapter HTML sample: ${html.substring(0, 1000)}`);
            return 'Chapter content could not be loaded from ReadNovelFull';
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }

    // Process chapter content to preserve paragraph structure
    processChapterContent(htmlContent) {
        if (!htmlContent) return '';
        
        console.log(`ReadNovelFull: Processing chapter content, input length: ${htmlContent.length}`);
        
        // Remove unwanted elements but preserve structure
        let processedContent = htmlContent
            // Remove ads and unwanted divs
            .replace(/<div[^>]*class="ads[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<div[^>]*class="advertisement[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            
            // Convert HTML paragraphs to double line breaks
            .replace(/<\/p>/gi, '</p>\n\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<\/p>/gi, '')
            
            // Convert line breaks
            .replace(/<br\s*\/?>/gi, '\n')
            
            // Handle strong/bold tags
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            
            // Handle emphasis/italic tags
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            
            // Remove other HTML tags
            .replace(/<[^>]+>/g, '')
            
            // Clean up entities
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            
            // Clean up multiple line breaks
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
        
        // Ensure each paragraph is separated by double line breaks
        const paragraphs = processedContent.split('\n\n').filter(p => p.trim().length > 0);
        const result = paragraphs.join('\n\n');
        
        console.log(`ReadNovelFull: Processed into ${paragraphs.length} paragraphs, final length: ${result.length}`);
        return result;
    }
}
