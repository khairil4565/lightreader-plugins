// @id readnovelfull
// @name ReadNovelFull
// @version 1.0.4
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
            console.log(`ReadNovelFull: HTML length: ${html ? html.length : 0} characters`);
            
            // ReadNovelFull uses specific structure
            const selectorPatterns = [
                '.list .row',
                '.list-novel .row',
                '.novel-list .row', 
                '.hot-item',
                '.s-title',
                'tr'
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
                }
            }
            
            if (!novelElements || novelElements.length === 0) {
                console.log(`ReadNovelFull: ❌ No novel elements found with any selector`);
                return [];
            }
            
            const novels = [];
            const elementsToProcess = Math.min(novelElements.length, 20);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    console.log(`ReadNovelFull: Processing element ${i + 1}/${elementsToProcess}`);
                    
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
                    
                    if (!title || !novelURL || title.length < 2) {
                        console.log(`ReadNovelFull: ❌ Skipping invalid novel: title="${title}", url="${novelURL}"`);
                        continue;
                    }
                    
                    // Try to find author
                    let author = null;
                    const authorSelectors = ['.genre', '.author', 'td:nth-child(2)'];
                    
                    for (const authorSel of authorSelectors) {
                        const authorElements = parseHTML(element.html, authorSel);
                        if (authorElements && authorElements.length > 0) {
                            const authorText = authorElements[0].text;
                            if (authorText && authorText.trim()) {
                                author = authorText.trim().replace(/^Author:\s*/i, '');
                                break;
                            }
                        }
                    }
                    
                    const novel = {
                        id: `readnovelfull_${Date.now()}_${i}`,
                        title: title,
                        author: author,
                        synopsis: null,
                        coverImageURL: null,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    console.log(`ReadNovelFull: ✅ Successfully added novel: "${title}"`);
                    
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
            
            // Parse basic novel info
            let title = "Unknown Title";
            let author = null;
            let synopsis = "No synopsis available";
            let coverURL = null;
            
            // Extract title - ReadNovelFull specific
            const titleSelectors = [
                '.title',
                'h3.title',
                'h1',
                '.desc h3'
            ];
            
            for (const selector of titleSelectors) {
                const titleElements = parseHTML(html, selector);
                if (titleElements && titleElements.length > 0 && titleElements[0].text) {
                    title = titleElements[0].text.trim();
                    console.log(`ReadNovelFull: Found title: ${title}`);
                    break;
                }
            }
            
            // Extract author - ReadNovelFull specific
            const authorSelectors = [
                '.info-meta li:contains("Author:") a',
                'a[href*="/authors/"]'
            ];
            
            for (const selector of authorSelectors) {
                const authorElements = parseHTML(html, selector);
                if (authorElements && authorElements.length > 0 && authorElements[0].text) {
                    author = authorElements[0].text.trim();
                    console.log(`ReadNovelFull: Found author: ${author}`);
                    break;
                }
            }
            
            // Extract synopsis - ReadNovelFull specific
            const synopsisSelectors = [
                '.desc-text',
                '#tab-description .desc-text',
                '.description'
            ];
            
            for (const selector of synopsisSelectors) {
                const synopsisElements = parseHTML(html, selector);
                if (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) {
                    synopsis = synopsisElements[0].text.trim();
                    console.log(`ReadNovelFull: Found synopsis: ${synopsis.substring(0, 100)}...`);
                    break;
                }
            }
            
            // Extract cover image - ReadNovelFull specific
            const coverSelectors = [
                '.book img',
                '.books img',
                'img[src*="thumb"]'
            ];
            
            for (const selector of coverSelectors) {
                const coverElements = parseHTML(html, selector);
                if (coverElements && coverElements.length > 0) {
                    const coverElement = coverElements[0];
                    const src = coverElement.src;
                    if (src) {
                        coverURL = this.resolveURL(src);
                        console.log(`ReadNovelFull: Found cover: ${coverURL}`);
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
            console.log(`ReadNovelFull: Novel URL: ${novelURL}`);
            
            // ReadNovelFull specific chapter selectors based on the HTML structure
            const chapterSelectors = [
                '.list-chapter li a',
                '#tab-chapters .list-chapter li a',
                '.panel-body .list-chapter li a',
                'ul.list-chapter li a'
            ];
            
            for (const selector of chapterSelectors) {
                console.log(`ReadNovelFull: Trying chapter selector: ${selector}`);
                const chapterElements = parseHTML(html, selector);
                
                if (chapterElements && chapterElements.length > 0) {
                    console.log(`ReadNovelFull: ✅ Found ${chapterElements.length} chapters with selector: ${selector}`);
                    return this.processChapterElements(chapterElements, novelURL);
                }
            }
            
            // If no chapters found in the main page, look for "READ NOW" button to get first chapter
            console.log(`ReadNovelFull: No chapter list found, looking for first chapter...`);
            
            const readNowSelectors = [
                '.btn-read-now',
                'a[href*="/chapter-"]',
                'a:contains("READ NOW")'
            ];
            
            let firstChapterURL = null;
            
            for (const selector of readNowSelectors) {
                const elements = parseHTML(html, selector);
                if (elements && elements.length > 0 && elements[0].href) {
                    firstChapterURL = this.resolveURL(elements[0].href);
                    console.log(`ReadNovelFull: Found first chapter URL: ${firstChapterURL}`);
                    break;
                }
            }
            
            // If we found a first chapter, try to get the chapter list from there
            if (firstChapterURL) {
                console.log(`ReadNovelFull: Fetching chapter list from first chapter page...`);
                try {
                    const chapterPageHTML = await fetch(firstChapterURL);
                    const chaptersFromChapterPage = await this.parseChapterListFromChapterPage(chapterPageHTML, novelURL, firstChapterURL);
                    if (chaptersFromChapterPage.length > 0) {
                        return chaptersFromChapterPage;
                    }
                } catch (error) {
                    console.log(`ReadNovelFull: Error fetching chapter page: ${error}`);
                }
            }
            
            console.log(`ReadNovelFull: ❌ No chapters found with any method`);
            return [];
            
        } catch (error) {
            console.log(`ReadNovelFull: Error parsing chapter list: ${error}`);
            return [];
        }
    }

    async parseChapterListFromChapterPage(html, novelURL, currentChapterURL) {
        try {
            console.log(`ReadNovelFull: Parsing chapter list from chapter page`);
            
            // Look for chapter navigation or chapter list on the chapter page
            const chapterNavSelectors = [
                '.chapter-nav select option',
                '.chapter-list a',
                'select[name="chapter"] option',
                '#chapter-list a'
            ];
            
            for (const selector of chapterNavSelectors) {
                console.log(`ReadNovelFull: Trying chapter nav selector: ${selector}`);
                const elements = parseHTML(html, selector);
                
                if (elements && elements.length > 0) {
                    console.log(`ReadNovelFull: ✅ Found ${elements.length} chapters in navigation`);
                    
                    const chapters = [];
                    for (let i = 0; i < elements.length; i++) {
                        const element = elements[i];
                        let chapterURL = element.href || element.value;
                        let chapterTitle = element.text || `Chapter ${i + 1}`;
                        
                        if (!chapterURL && element.value) {
                            // For select options, the value might be a relative URL
                            chapterURL = this.resolveURL(element.value);
                        }
                        
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
                    
                    return chapters;
                }
            }
            
            // If no chapter navigation found, try to generate chapters based on current URL pattern
            console.log(`ReadNovelFull: No chapter navigation found, generating from current URL pattern`);
            return this.generateChapterListFromCurrentChapter(currentChapterURL, novelURL);
            
        } catch (error) {
            console.log(`ReadNovelFull: Error parsing chapter page: ${error}`);
            return [];
        }
    }

    generateChapterListFromCurrentChapter(currentChapterURL, novelURL) {
        try {
            console.log(`ReadNovelFull: Generating chapters from current URL: ${currentChapterURL}`);
            
            // Extract chapter number from current URL
            const chapterMatch = currentChapterURL.match(/chapter-(\d+)/i);
            if (!chapterMatch) {
                console.log(`ReadNovelFull: Could not extract chapter number from URL`);
                return [];
            }
            
            const currentChapterNum = parseInt(chapterMatch[1]);
            console.log(`ReadNovelFull: Current chapter number: ${currentChapterNum}`);
            
            // Generate URLs for a reasonable range of chapters
            const chapters = [];
            const baseURL = currentChapterURL.replace(/chapter-\d+[^\/]*\.html/, '');
            
            // Generate chapters starting from 1 up to current + 50
            const maxChapters = Math.max(currentChapterNum + 50, 100);
            
            for (let i = 1; i <= maxChapters; i++) {
                // Try to match the URL pattern of the current chapter
                let chapterURL;
                if (currentChapterURL.includes('chapter-' + currentChapterNum + '-')) {
                    // Has chapter title in URL
                    const titlePart = currentChapterURL.split('chapter-' + currentChapterNum + '-')[1];
                    const baseTitlePart = titlePart.split('.html')[0];
                    chapterURL = `${baseURL}chapter-${i}-${this.generateChapterSlug(i)}.html`;
                } else {
                    // Simple chapter number
                    chapterURL = `${baseURL}chapter-${i}.html`;
                }
                
                const chapter = {
                    id: `readnovelfull_chapter_${Date.now()}_${i}`,
                    title: `Chapter ${i}`,
                    novelId: novelURL,
                    chapterNumber: i,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
            }
            
            console.log(`ReadNovelFull: ✅ Generated ${chapters.length} chapters`);
            return chapters;
            
        } catch (error) {
            console.log(`ReadNovelFull: Error generating chapters: ${error}`);
            return [];
        }
    }

    generateChapterSlug(chapterNumber) {
        // Generate a reasonable slug for the chapter
        const slugs = [
            'class-awakening', 'cultivation', 'successful-awakening', 'meeting-the-principal', 
            'registering-as-an-awakener-1', 'registering-as-an-awakener-2', 'information-about-awakeners-and-the-land-of-origin-1',
            'information-about-awakeners-and-the-land-of-origin-2', 'information-about-awakeners-and-the-land-of-origin-3',
            'preparations', 'land-of-origin', 'reality-different-from-expectation', 'first-kill', 'new-skill',
            'killing-more-slimes', 'increasing-strength', 'spirit-crystal', 'suspicions', 'clearing-the-space-1',
            'clearing-the-space-2'
        ];
        
        if (chapterNumber <= slugs.length) {
            return slugs[chapterNumber - 1];
        }
        
        return `chapter-${chapterNumber}`;
    }

    processChapterElements(chapterElements, novelURL) {
        const chapters = [];
        
        for (let i = 0; i < chapterElements.length; i++) {
            try {
                const element = chapterElements[i];
                
                // Get chapter title from the nested span with class "nchr-text" or from the text
                let chapterTitle = '';
                const spanElements = parseHTML(element.html, '.nchr-text');
                if (spanElements && spanElements.length > 0) {
                    chapterTitle = spanElements[0].text.trim();
                } else {
                    chapterTitle = element.text ? element.text.trim() : `Chapter ${i + 1}`;
                }
                
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) {
                    console.log(`ReadNovelFull: Skipping chapter ${i}: no URL`);
                    continue;
                }
                
                // Extract chapter number from title or URL
                let chapterNumber = i + 1;
                
                const titleNumberMatch = chapterTitle.match(/Chapter\s+(\d+)/i);
                if (titleNumberMatch) {
                    chapterNumber = parseInt(titleNumberMatch[1]);
                } else {
                    const urlNumberMatch = chapterURL.match(/chapter[-_]?(\d+)/i);
                    if (urlNumberMatch) {
                        chapterNumber = parseInt(urlNumberMatch[1]);
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
                console.log(`ReadNovelFull: Error processing chapter element ${i}: ${error}`);
            }
        }
        
        console.log(`ReadNovelFull: ✅ Processed ${chapters.length} chapter elements`);
        return chapters;
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
                '.reading-content',
                '.content',
                '#content'
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
