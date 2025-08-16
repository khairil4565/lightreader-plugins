// @id readnovelfull
// @name ReadNovelFull
// @version 1.0.0
// @description Read novels from ReadNovelFull.com with complete chapter loading and cover image support
// @author khairil4565
// @website https://readnovelfull.com

class ReadNovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://readnovelfull.com';
        this.maxConcurrentRequests = 3; // Limit concurrent requests to be respectful
    }

    async searchNovels(query) {
        console.log(`Searching for: ${query}`);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/popular-novel`;
                    break;
                case 'latest':
                    url = `${this.baseURL}/latest-release-novel`;
                    break;
                case 'hot':
                    url = `${this.baseURL}/hot-novel`;
                    break;
                case 'completed':
                    url = `${this.baseURL}/completed-novel`;
                    break;
                default:
                    url = `${this.baseURL}/search?keyword=${encodeURIComponent(query)}`;
            }
            
            console.log(`Fetching from URL: ${url}`);
            const html = await fetch(url);
            
            return this.parseNovelList(html, query);
            
        } catch (error) {
            console.log(`Error searching novels: ${error}`);
            return [];
        }
    }

    async parseNovelList(html, queryType) {
        try {
            // ReadNovelFull uses different selectors than NovelFull
            const selector = '.list-novel .row, .novel-list .row, .list .row';
            
            console.log(`Using selector: ${selector}`);
            const novelElements = parseHTML(html, selector);
            console.log(`Found ${novelElements.length} novel elements`);
            
            const novels = [];
            
            // Process first 10 novels for better performance
            const elementsToProcess = Math.min(novelElements.length, 10);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    
                    // Get title and URL - ReadNovelFull structure
                    const titleElements = parseHTML(element.html, '.novel-title a, .title a, h3 a, h4 a');
                    if (!titleElements || titleElements.length === 0) {
                        console.log(`No title found in element ${i}`);
                        continue;
                    }
                    
                    const titleElement = titleElements[0];
                    const title = titleElement.text ? titleElement.text.trim() : '';
                    const novelURL = this.resolveURL(titleElement.href);
                    
                    if (!title || !novelURL) {
                        console.log(`Skipping element ${i}: title="${title}", url="${novelURL}"`);
                        continue;
                    }
                    
                    // Get author from current page
                    let author = null;
                    const authorElements = parseHTML(element.html, '.author, .novel-author');
                    if (authorElements && authorElements.length > 0) {
                        const authorElement = authorElements[0];
                        const authorText = authorElement.text || authorElement.textContent || authorElement.innerText;
                        
                        if (authorText && authorText.trim()) {
                            author = authorText.trim()
                                .replace(/^Author:\s*/i, '') // Remove "Author:" prefix
                                .replace(/^\s*📝\s*/, '') // Remove pencil icon
                                .replace(/\s+/g, ' ')     // Normalize whitespace
                                .trim();
                            
                            if (!author || author.length < 2) {
                                author = null;
                            }
                        }
                    }
                    
                    // Get cover image from list page
                    let coverURL = null;
                    const coverElements = parseHTML(element.html, '.novel-cover img, .cover img, .book img, img');
                    if (coverElements && coverElements.length > 0) {
                        for (const coverElement of coverElements) {
                            const src = coverElement.src || coverElement['data-src'] || coverElement['data-original'];
                            if (src && (src.includes('cover') || src.includes('thumb') || src.includes('image'))) {
                                coverURL = this.resolveURL(src);
                                console.log(`Found cover for ${title}: ${coverURL}`);
                                break;
                            }
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
                    console.log(`Added novel: "${title}" by ${author || 'Unknown'} with cover: ${coverURL ? 'Yes' : 'No'}`);
                    
                } catch (error) {
                    console.log(`Error parsing novel element ${i}: ${error}`);
                }
            }
            
            console.log(`Successfully parsed ${novels.length} novels`);
            return novels;
            
        } catch (error) {
            console.log(`Error parsing novel list: ${error}`);
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
            console.log(`Fetching novel details from: ${novelURL}`);
            const html = await fetch(novelURL);
            
            // Parse basic novel info
            const titleElements = parseHTML(html, '.novel-detail-title h1, .novel-title h1, h1.title');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            let author = null;
            const authorElements = parseHTML(html, '.novel-detail-author a, .author a, .info-author a');
            if (authorElements && authorElements.length > 0) {
                author = authorElements[0].text ? authorElements[0].text.trim() : null;
            }
            
            const synopsisElements = parseHTML(html, '.novel-detail-body, .summary, .description');
            const synopsis = (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) ?
                synopsisElements[0].text.trim() : 'No synopsis available';
            
            // Get cover image from detail page
            let coverURL = null;
            const coverElements = parseHTML(html, '.novel-detail-cover img, .novel-cover img, .cover img');
            if (coverElements && coverElements.length > 0) {
                const coverElement = coverElements[0];
                const src = coverElement.src || coverElement['data-src'] || coverElement['data-original'];
                if (src) {
                    coverURL = this.resolveURL(src);
                    console.log(`Found cover from detail page: ${coverURL}`);
                }
            }
            
            // Fetch all chapters in parallel
            const chapters = await this.fetchAllChaptersParallel(html, novelURL);
            
            const novel = {
                id: `readnovelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            console.log(`Novel details parsed - Title: ${title}, Author: ${author}, Cover: ${coverURL ? 'Found' : 'Not found'}`);
            console.log(`Total chapters found: ${chapters.length}`);
            
            const result = {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
            console.log(`Returning novel detail with structure:`, Object.keys(result));
            return result;
            
        } catch (error) {
            console.log(`Error fetching novel details: ${error}`);
            throw error;
        }
    }

    async fetchAllChaptersParallel(firstPageHtml, novelURL) {
        let allChapters = [];
        
        try {
            // Get chapters from first page
            const firstPageChapters = this.parseChapterList(firstPageHtml, novelURL);
            allChapters = allChapters.concat(firstPageChapters);
            
            // Determine total pages
            const totalPages = this.getTotalPages(firstPageHtml);
            console.log(`Detected ${totalPages} total pages of chapters`);
            
            if (totalPages <= 1) {
                console.log(`Single page novel - found ${allChapters.length} chapters`);
                return allChapters;
            }
            
            // Create array of page numbers to fetch
            const pagesToFetch = [];
            for (let page = 2; page <= totalPages; page++) {
                pagesToFetch.push(page);
            }
            
            console.log(`Will fetch ${pagesToFetch.length} additional pages in parallel`);
            
            // Fetch pages in parallel batches
            const allPageChapters = await this.fetchPagesInBatches(pagesToFetch, novelURL);
            
            // Combine all chapters
            allChapters = allChapters.concat(allPageChapters);
            
            // Sort chapters by chapter number
            allChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
            
            console.log(`Successfully fetched ${allChapters.length} total chapters from ${totalPages} pages`);
            
        } catch (error) {
            console.log(`Error in fetchAllChaptersParallel: ${error}`);
        }
        
        return allChapters;
    }

    async fetchPagesInBatches(pages, novelURL) {
        const allChapters = [];
        const batchSize = this.maxConcurrentRequests;
        
        for (let i = 0; i < pages.length; i += batchSize) {
            const batch = pages.slice(i, i + batchSize);
            console.log(`Fetching batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(pages.length/batchSize)}: pages ${batch.join(', ')}`);
            
            // Create promises for this batch
            const batchPromises = batch.map(pageNum => this.fetchSinglePage(pageNum, novelURL));
            
            try {
                // Wait for all pages in this batch to complete
                const batchResults = await Promise.all(batchPromises);
                
                // Flatten and add to all chapters
                for (const pageChapters of batchResults) {
                    if (pageChapters && pageChapters.length > 0) {
                        allChapters.push(...pageChapters);
                    }
                }
                
                console.log(`Batch completed. Total chapters so far: ${allChapters.length}`);
                
            } catch (error) {
                console.log(`Error in batch: ${error}`);
                // Continue with next batch even if this one fails
            }
        }
        
        return allChapters;
    }

    async fetchSinglePage(pageNum, novelURL) {
        try {
            // ReadNovelFull pagination pattern
            const pageURL = `${novelURL}?page=${pageNum}`;
            const pageHtml = await fetch(pageURL);
            const chapters = this.parseChapterList(pageHtml, novelURL);
            
            console.log(`Page ${pageNum}: found ${chapters.length} chapters`);
            return chapters;
            
        } catch (error) {
            console.log(`Error fetching page ${pageNum}: ${error}`);
            return [];
        }
    }

    getTotalPages(html) {
        // Try to find pagination for ReadNovelFull
        const paginationElements = parseHTML(html, '.pagination .last a, .paging .last a');
        
        if (paginationElements && paginationElements.length > 0) {
            for (const element of paginationElements) {
                if (element.href && element.href.includes('page=')) {
                    const lastPageMatch = element.href.match(/page=(\d+)/);
                    if (lastPageMatch) {
                        return parseInt(lastPageMatch[1]);
                    }
                }
            }
        }
        
        // Alternative method - look for page numbers
        const pageNumberElements = parseHTML(html, '.pagination a, .paging a');
        let maxPage = 1;
        
        if (pageNumberElements && pageNumberElements.length > 0) {
            for (const element of pageNumberElements) {
                const pageText = element.text;
                if (pageText && /^\d+$/.test(pageText.trim())) {
                    const pageNum = parseInt(pageText.trim());
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            }
        }
        
        return maxPage;
    }

    parseChapterList(html, novelURL) {
        const chapters = [];
        
        // ReadNovelFull chapter selectors
        const chapterElements = parseHTML(html, '.chapter-list .row a, .list-chapter a, .chapter-item a');
        
        for (let i = 0; i < chapterElements.length; i++) {
            const element = chapterElements[i];
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : `Chapter ${i + 1}`;
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) continue;
                
                // Extract chapter number from title or URL
                let chapterNumber = i + 1;
                
                // Try to extract chapter number from title first
                const titleNumberMatch = chapterTitle.match(/Chapter\s+(\d+)/i);
                if (titleNumberMatch) {
                    chapterNumber = parseInt(titleNumberMatch[1]);
                }
                
                // If not found in title, try URL
                if (!titleNumberMatch) {
                    const urlNumberMatch = chapterURL.match(/chapter[-_](\d+)/i);
                    if (urlNumberMatch) {
                        chapterNumber = parseInt(urlNumberMatch[1]);
                    }
                }
                
                const chapter = {
                    id: `chapter_${Date.now()}_${i}_${chapterNumber}`,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
                
            } catch (error) {
                console.log(`Error parsing chapter ${i}: ${error}`);
            }
        }
        
        console.log(`Parsed ${chapters.length} chapters from current page`);
        return chapters;
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            // ReadNovelFull chapter content selectors
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content',
                '.chapter-body',
                '#content',
                '.content',
                '.novel-content'
            ];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                if (contentElements && contentElements.length > 0) {
                    let content = contentElements[0].html || contentElements[0].text;
                    
                    if (content && content.length > 100) {
                        // Process HTML content to preserve paragraphs
                        content = this.processChapterContent(content);
                        return content;
                    }
                }
            }
            
            return 'Chapter content could not be loaded';
            
        } catch (error) {
            console.log(`Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }

    // Process chapter content to preserve paragraph structure
    processChapterContent(htmlContent) {
        if (!htmlContent) return '';
        
        // Remove unwanted elements but preserve structure
        let processedContent = htmlContent
            // Remove ads and unwanted divs
            .replace(/<div[^>]*class="ads[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<div[^>]*class="advertisement[^"]*"[^>]*>.*?<\/div>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            
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
        return paragraphs.join('\n\n');
    }

    // Promise-based delay function
    async delay(ms) {
        return new Promise(resolve => {
            const start = Date.now();
            while (Date.now() - start < ms) {
                // Busy wait for the specified time
            }
            resolve();
        });
    }
}
