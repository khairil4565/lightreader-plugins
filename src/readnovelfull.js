// @id readnovelfull
// @name ReadNovelFull
// @version 1.0.5
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
                    url = `${this.baseURL}/novel-list/most-popular-novel`;
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
                    url = `${this.baseURL}/novel-list/search?keyword=${encodeURIComponent(query)}`;
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
            
            // ReadNovelFull uses specific structure
            const selectorPatterns = [
                '.list .row',
                '.list-novel .row',
                '.hot-item',
                '.s-title',
                'tr'
            ];
            
            let novelElements = null;
            
            for (const selector of selectorPatterns) {
                novelElements = parseHTML(html, selector);
                if (novelElements && novelElements.length > 0) {
                    console.log(`ReadNovelFull: ✅ Found ${novelElements.length} elements with selector: ${selector}`);
                    break;
                }
            }
            
            if (!novelElements || novelElements.length === 0) {
                console.log(`ReadNovelFull: ❌ No novel elements found`);
                return [];
            }
            
            const novels = [];
            const elementsToProcess = Math.min(novelElements.length, 20);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    
                    // Try multiple title selectors
                    const titleSelectors = [
                        'h3 a',
                        '.s-title h3 a',
                        'a[href*=".html"]',
                        'a',
                        'td:first-child a'
                    ];
                    
                    let titleElement = null;
                    
                    for (const titleSel of titleSelectors) {
                        const titleElements = parseHTML(element.html, titleSel);
                        if (titleElements && titleElements.length > 0) {
                            titleElement = titleElements[0];
                            break;
                        }
                    }
                    
                    if (!titleElement) continue;
                    
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    if (!title || !novelURL || title.length < 2) continue;
                    
                    const novel = {
                        id: `readnovelfull_${Date.now()}_${i}`,
                        title: title,
                        author: null,
                        synopsis: null,
                        coverImageURL: null,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    console.log(`ReadNovelFull: ✅ Added novel: "${title}"`);
                    
                } catch (error) {
                    console.log(`ReadNovelFull: Error parsing element ${i}: ${error}`);
                }
            }
            
            console.log(`ReadNovelFull: Successfully parsed ${novels.length} novels`);
            return novels;
            
        } catch (error) {
            console.log(`ReadNovelFull: Error in parseNovelList: ${error}`);
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
            
            // Parse basic novel info
            let title = "Unknown Title";
            let author = null;
            let synopsis = "No synopsis available";
            let coverURL = null;
            let novelId = null;
            
            // Extract title
            const titleSelectors = [
                '.title',
                'h3.title',
                'h1'
            ];
            
            for (const selector of titleSelectors) {
                const titleElements = parseHTML(html, selector);
                if (titleElements && titleElements.length > 0 && titleElements[0].text) {
                    title = titleElements[0].text.trim();
                    break;
                }
            }
            
            // Extract author
            const authorElements = parseHTML(html, 'a[href*="/authors/"]');
            if (authorElements && authorElements.length > 0 && authorElements[0].text) {
                author = authorElements[0].text.trim();
            }
            
            // Extract synopsis
            const synopsisElements = parseHTML(html, '.desc-text');
            if (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) {
                synopsis = synopsisElements[0].text.trim();
            }
            
            // Extract cover image
            const coverElements = parseHTML(html, '.book img');
            if (coverElements && coverElements.length > 0) {
                const src = coverElements[0].src;
                if (src) {
                    coverURL = this.resolveURL(src);
                }
            }
            
            // CRITICAL: Extract novel ID for AJAX chapter loading
            // This is the key insight from LNReader - they use the data-novel-id attribute
            const novelIdMatch = html.match(/data-novel-id="([^"]+)"/);
            if (novelIdMatch) {
                novelId = novelIdMatch[1];
                console.log(`ReadNovelFull: Found novel ID: ${novelId}`);
            } else {
                // Fallback: extract from URL
                const urlMatch = novelURL.match(/\/([^\/]+)\.html$/);
                if (urlMatch) {
                    novelId = urlMatch[1];
                    console.log(`ReadNovelFull: Using URL-based novel ID: ${novelId}`);
                }
            }
            
            // Parse chapter list using AJAX endpoint (key insight from LNReader)
            console.log(`ReadNovelFull: Starting to parse chapter list...`);
            const chapters = await this.fetchChapterListViaAjax(novelId, novelURL);
            
            const novel = {
                id: `readnovelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log(`ReadNovelFull: Novel details parsed: ${title} with ${chapters.length} chapters`);
            
            return {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching novel details: ${error}`);
            throw error;
        }
    }

    // This is the KEY method - based on LNReader's approach
    async fetchChapterListViaAjax(novelId, novelURL) {
        try {
            if (!novelId) {
                console.log(`ReadNovelFull: No novel ID found, falling back to HTML parsing`);
                return this.parseChapterListFromHTML(novelURL);
            }
            
            // Use ReadNovelFull's AJAX endpoint to get complete chapter list
            const ajaxURL = `${this.baseURL}/ajax/chapter-archive?novelId=${novelId}`;
            console.log(`ReadNovelFull: Fetching chapters from AJAX: ${ajaxURL}`);
            
            const chapterHTML = await fetch(ajaxURL);
            console.log(`ReadNovelFull: AJAX response length: ${chapterHTML ? chapterHTML.length : 0}`);
            
            if (!chapterHTML || chapterHTML.length < 100) {
                console.log(`ReadNovelFull: AJAX failed, falling back to HTML parsing`);
                return this.parseChapterListFromHTML(novelURL);
            }
            
            // Parse the AJAX response
            const chapters = [];
            
            // The AJAX response contains chapter links in various formats
            const chapterSelectors = [
                'a[href*="/chapter-"]',
                'a[href*="/ch-"]',
                'option[value*="/chapter-"]',
                'option[value*="/ch-"]'
            ];
            
            for (const selector of chapterSelectors) {
                const chapterElements = parseHTML(chapterHTML, selector);
                
                if (chapterElements && chapterElements.length > 0) {
                    console.log(`ReadNovelFull: ✅ Found ${chapterElements.length} chapters with AJAX selector: ${selector}`);
                    
                    for (let i = 0; i < chapterElements.length; i++) {
                        const element = chapterElements[i];
                        
                        let chapterURL = element.href || element.value;
                        let chapterTitle = element.text || element.textContent || `Chapter ${i + 1}`;
                        
                        if (!chapterURL) continue;
                        
                        chapterURL = this.resolveURL(chapterURL);
                        chapterTitle = chapterTitle.trim();
                        
                        // Extract chapter number
                        let chapterNumber = i + 1;
                        const numberMatch = chapterTitle.match(/Chapter\s+(\d+)/i) || chapterURL.match(/chapter-(\d+)/i);
                        if (numberMatch) {
                            chapterNumber = parseInt(numberMatch[1]);
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
                    }
                    
                    if (chapters.length > 0) {
                        console.log(`ReadNovelFull: ✅ Successfully parsed ${chapters.length} chapters via AJAX`);
                        return chapters;
                    }
                }
            }
            
            console.log(`ReadNovelFull: AJAX parsing failed, falling back to HTML parsing`);
            return this.parseChapterListFromHTML(novelURL);
            
        } catch (error) {
            console.log(`ReadNovelFull: AJAX chapter fetch error: ${error}`);
            return this.parseChapterListFromHTML(novelURL);
        }
    }

    // Fallback method for when AJAX fails
    async parseChapterListFromHTML(novelURL) {
        try {
            console.log(`ReadNovelFull: Parsing chapters from main novel page HTML`);
            const html = await fetch(novelURL);
            
            // Look for chapters directly in the HTML
            const chapterSelectors = [
                '.list-chapter li a',
                '#tab-chapters .list-chapter li a',
                '.panel-body .list-chapter li a',
                'ul.list-chapter li a'
            ];
            
            for (const selector of chapterSelectors) {
                const chapterElements = parseHTML(html, selector);
                
                if (chapterElements && chapterElements.length > 0) {
                    console.log(`ReadNovelFull: ✅ Found ${chapterElements.length} chapters with HTML selector: ${selector}`);
                    
                    const chapters = [];
                    for (let i = 0; i < chapterElements.length; i++) {
                        const element = chapterElements[i];
                        
                        // Get chapter title from nested span or direct text
                        let chapterTitle = '';
                        const spanElements = parseHTML(element.html, '.nchr-text');
                        if (spanElements && spanElements.length > 0) {
                            chapterTitle = spanElements[0].text.trim();
                        } else {
                            chapterTitle = element.text ? element.text.trim() : `Chapter ${i + 1}`;
                        }
                        
                        const chapterURL = this.resolveURL(element.href);
                        if (!chapterURL) continue;
                        
                        // Extract chapter number
                        let chapterNumber = i + 1;
                        const numberMatch = chapterTitle.match(/Chapter\s+(\d+)/i) || chapterURL.match(/chapter-(\d+)/i);
                        if (numberMatch) {
                            chapterNumber = parseInt(numberMatch[1]);
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
                    }
                    
                    if (chapters.length > 0) {
                        console.log(`ReadNovelFull: ✅ Successfully parsed ${chapters.length} chapters from HTML`);
                        return chapters;
                    }
                }
            }
            
            console.log(`ReadNovelFull: ❌ No chapters found in HTML`);
            return [];
            
        } catch (error) {
            console.log(`ReadNovelFull: Error parsing HTML chapters: ${error}`);
            return [];
        }
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`ReadNovelFull: Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            // ReadNovelFull chapter content selectors
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content',
                '.chapter-body',
                '.reading-content',
                '.content',
                '#content'
            ];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                
                if (contentElements && contentElements.length > 0) {
                    let content = contentElements[0].html || contentElements[0].text;
                    
                    if (content && content.length > 100) {
                        console.log(`ReadNovelFull: ✅ Found content with ${selector}, length: ${content.length}`);
                        content = this.processChapterContent(content);
                        return content;
                    }
                }
            }
            
            console.log(`ReadNovelFull: ❌ No chapter content found`);
            return 'Chapter content could not be loaded from ReadNovelFull';
            
        } catch (error) {
            console.log(`ReadNovelFull: Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }

    processChapterContent(htmlContent) {
        if (!htmlContent) return '';
        
        // Clean and format the content
        let processedContent = htmlContent
            // Remove ads and scripts
            .replace(/<div[^>]*class="ads[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            
            // Convert paragraphs
            .replace(/<\/p>/gi, '</p>\n\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<\/p>/gi, '')
            
            // Convert line breaks
            .replace(/<br\s*\/?>/gi, '\n')
            
            // Handle formatting
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            
            // Remove remaining HTML tags
            .replace(/<[^>]+>/g, '')
            
            // Clean up entities
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            
            // Clean up spacing
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
        
        // Ensure paragraphs are properly separated
        const paragraphs = processedContent.split('\n\n').filter(p => p.trim().length > 0);
        const result = paragraphs.join('\n\n');
        
        console.log(`ReadNovelFull: Processed into ${paragraphs.length} paragraphs`);
        return result;
    }
}
