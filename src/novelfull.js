// @id novelfull
// @name NovelFull
// @version 1.0.5
// @description Read novels from NovelFull.net with optimized pagination and deduplication
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
        this.maxConcurrentRequests = 3; // Limit concurrent requests to be respectful
    }

    async searchNovels(query) {
        console.log(`Searching for: ${query}`);
        
        try {
            let url;
            
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/most-popular`;
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
            const selector = '.list.list-truyen .row';
            
            console.log(`Using selector: ${selector}`);
            const novelElements = parseHTML(html, selector);
            console.log(`Found ${novelElements.length} novel elements`);
            
            const novels = [];
            
            // Process first 10 novels for better performance
            const elementsToProcess = Math.min(novelElements.length, 10);
            
            for (let i = 0; i < elementsToProcess; i++) {
                try {
                    const element = novelElements[i];
                    
                    // Get title and URL
                    const titleElements = parseHTML(element.html, 'h3.truyen-title a, .truyen-title a');
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
                    const authorElements = parseHTML(element.html, '.author');
                    if (authorElements && authorElements.length > 0) {
                        const authorElement = authorElements[0];
                        const authorText = authorElement.text || authorElement.textContent || authorElement.innerText;
                        
                        if (authorText && authorText.trim()) {
                            author = authorText.trim()
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
                    const coverElements = parseHTML(element.html, '.book img, .cover img, img');
                    if (coverElements && coverElements.length > 0) {
                        for (const coverElement of coverElements) {
                            const src = coverElement.src || coverElement['data-src'];
                            if (src && src.includes('uploads')) {
                                coverURL = this.resolveURL(src);
                                // Keep as thumbnail URL - it works better than converted ones
                                console.log(`Found cover for ${title}: ${coverURL}`);
                                break;
                            }
                        }
                    }
                    
                    const novel = {
                        id: `novelfull_${Date.now()}_${i}`,
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
            const titleElements = parseHTML(html, '.books .desc h3.title, h3.title');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            let author = null;
            const authorLinkElements = parseHTML(html, '.info a[href*="author"]');
            if (authorLinkElements && authorLinkElements.length > 0) {
                author = authorLinkElements[0].text ? authorLinkElements[0].text.trim() : null;
            }
            
            const synopsisElements = parseHTML(html, '.desc-text');
            const synopsis = (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) ?
                synopsisElements[0].text.trim() : 'No synopsis available';
            
            let coverURL = null;
            const coverElements = parseHTML(html, '.books .book img');
            if (coverElements && coverElements.length > 0) {
                const coverElement = coverElements[0];
                const src = coverElement.src || coverElement['data-src'];
                if (src && src.includes('uploads')) {
                    coverURL = this.resolveURL(src);
                    console.log(`Found cover from detail page: ${coverURL}`);
                }
            }
            
            // Optimized chapter fetching with deduplication
            const chapters = await this.fetchAllChaptersOptimized(html, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
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

    async fetchAllChaptersOptimized(firstPageHtml, novelURL) {
        let allChapters = [];
        const seenUrls = new Set(); // Global deduplication
        
        try {
            // Get chapters from first page
            const firstPageChapters = this.parseChapterListOptimized(firstPageHtml, novelURL);
            
            // Add first page chapters with deduplication
            for (const chapter of firstPageChapters) {
                if (!seenUrls.has(chapter.url.toLowerCase())) {
                    seenUrls.add(chapter.url.toLowerCase());
                    allChapters.push(chapter);
                }
            }
            
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
            
            // Fetch pages in parallel batches with deduplication
            const additionalChapters = await this.fetchPagesInBatchesOptimized(pagesToFetch, novelURL, seenUrls);
            
            // Combine all chapters
            allChapters = allChapters.concat(additionalChapters);
            
            // Sort chapters by chapter number
            allChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
            
            console.log(`Successfully fetched ${allChapters.length} total chapters from ${totalPages} pages`);
            
        } catch (error) {
            console.log(`Error in fetchAllChaptersOptimized: ${error}`);
        }
        
        return allChapters;
    }

    async fetchPagesInBatchesOptimized(pages, novelURL, seenUrls) {
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
                
                // Add chapters with deduplication
                for (const pageChapters of batchResults) {
                    if (pageChapters && pageChapters.length > 0) {
                        for (const chapter of pageChapters) {
                            if (!seenUrls.has(chapter.url.toLowerCase())) {
                                seenUrls.add(chapter.url.toLowerCase());
                                allChapters.push(chapter);
                            }
                        }
                    }
                }
                
                console.log(`Batch completed. Total unique chapters so far: ${allChapters.length + Array.from(seenUrls).length - allChapters.length} (${allChapters.length} new)`);
                
            } catch (error) {
                console.log(`Error in batch: ${error}`);
                // Continue with next batch even if this one fails
            }
        }
        
        return allChapters;
    }

    async fetchSinglePage(pageNum, novelURL) {
        try {
            const pageURL = `${novelURL}?page=${pageNum}`;
            const pageHtml = await fetch(pageURL);
            const chapters = this.parseChapterListOptimized(pageHtml, novelURL);
            
            console.log(`Page ${pageNum}: found ${chapters.length} chapters`);
            return chapters;
            
        } catch (error) {
            console.log(`Error fetching page ${pageNum}: ${error}`);
            return [];
        }
    }

    getTotalPages(html) {
        // Try to find the last page number from pagination
        const paginationElements = parseHTML(html, '.pagination .last a');
        
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
        
        // Alternative method
        const pageNumberElements = parseHTML(html, '.pagination a[data-page]');
        let maxPage = 1;
        
        if (pageNumberElements && pageNumberElements.length > 0) {
            for (const element of pageNumberElements) {
                const dataPage = element['data-page'];
                if (dataPage) {
                    const pageNum = parseInt(dataPage) + 1;
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            }
        }
        
        return maxPage;
    }
    
    parseChapterListOptimized(html, novelURL) {
        const chapters = [];
        
        // Optimized selector to get exactly chapter links like LightReader (should get ~50 per page)
        const chapterElements = parseHTML(html, 'ul li a[href*="chapter-"]:not([href*="edit"]):not([href*="report"]):not([class*="btn"]), li a[href*="chapter-"]:not([href*="edit"]):not([class*="btn"])');
        
        console.log(`Parsing ${chapterElements.length} chapter elements from page`);
        
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
                } else {
                    // If not found in title, try URL
                    const urlNumberMatch = chapterURL.match(/chapter[_-](\d+)/i);
                    if (urlNumberMatch) {
                        chapterNumber = parseInt(urlNumberMatch[1]);
                    }
                }
                
                // Create consistent ID based on chapter number and URL
                const urlSlug = chapterURL.split('/').pop() || chapterNumber;
                
                const chapter = {
                    id: `chapter_${chapterNumber}_${urlSlug}`,
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
            
            const contentSelectors = [
                '#chapter-content',
                '.chapter-content', 
                '.chapter-c',
                '.content',
                '.chapter-body'
            ];
            
            for (const selector of contentSelectors) {
                const contentElements = parseHTML(html, selector);
                if (contentElements && contentElements.length > 0 && contentElements[0].text) {
                    const content = contentElements[0].text.trim();
                    if (content.length > 100) {
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
}
