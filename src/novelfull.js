// @id novelfull
// @name NovelFull
// @version 1.0.6
// @description Read novels from NovelFull.net with optimized 50-chapter pagination and 10-page batching
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
        this.maxConcurrentRequests = 10; // Increased to handle 10-page batches
        this.chaptersPerPage = 50; // Expected chapters per page
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
            
            // Fetch all chapters with new optimized pagination
            const chapters = await this.fetchAllChaptersWithBatching(html, novelURL);
            
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

    async fetchAllChaptersWithBatching(firstPageHtml, novelURL) {
        let allChapters = [];
        const seenUrls = new Set(); // Simple URL-based deduplication
        
        try {
            console.log('🔄 Starting optimized chapter fetching with 10-page batches...');
            
            // Parse first page chapters
            const firstPageChapters = this.parseChapterListOptimized(firstPageHtml, novelURL);
            console.log(`📖 Page 1: Found ${firstPageChapters.length} chapters`);
            
            // Add first page chapters (limit to 50)
            const limitedFirstPage = firstPageChapters.slice(0, this.chaptersPerPage);
            for (const chapter of limitedFirstPage) {
                if (!seenUrls.has(chapter.url)) {
                    seenUrls.add(chapter.url);
                    allChapters.push(chapter);
                }
            }
            
            // Determine total pages
            const totalPages = this.getTotalPages(firstPageHtml);
            console.log(`📚 Detected ${totalPages} total pages of chapters`);
            
            if (totalPages <= 1) {
                console.log(`✅ Single page novel - found ${allChapters.length} chapters`);
                return allChapters;
            }
            
            // Fetch remaining pages in batches of 10
            const additionalChapters = await this.fetchPagesInTenPageBatches(2, totalPages, novelURL, seenUrls);
            allChapters = allChapters.concat(additionalChapters);
            
            // Sort chapters by chapter number
            allChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
            
            console.log(`🎉 Successfully fetched ${allChapters.length} total chapters from ${totalPages} pages`);
            
        } catch (error) {
            console.log(`❌ Error in fetchAllChaptersWithBatching: ${error}`);
        }
        
        return allChapters;
    }

    async fetchPagesInTenPageBatches(startPage, totalPages, novelURL, seenUrls) {
        const allChapters = [];
        const BATCH_SIZE = 10; // Fixed 10-page batches
        
        for (let batchStart = startPage; batchStart <= totalPages; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
            const batch = [];
            
            // Create batch array
            for (let page = batchStart; page <= batchEnd; page++) {
                batch.push(page);
            }
            
            console.log(`🔄 Fetching batch: pages ${batchStart}–${batchEnd} (${batch.length} pages)`);
            
            try {
                const batchChapters = await this.fetchPageBatch(batch, novelURL, seenUrls);
                allChapters.push(...batchChapters);
                
                console.log(`✅ Batch complete: Added ${batchChapters.length} chapters (total: ${allChapters.length})`);
                
                // Add delay between batches to be respectful
                if (batchEnd < totalPages) {
                    console.log('⏳ Waiting 2 seconds before next batch...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.log(`❌ Error in batch ${batchStart}-${batchEnd}: ${error}`);
                // Continue with next batch even if this one fails
            }
        }
        
        return allChapters;
    }

    async fetchPageBatch(pageNumbers, novelURL, seenUrls) {
        const batchChapters = [];
        
        // Create promises for all pages in batch (up to 10 concurrent)
        const promises = pageNumbers.map(async (pageNum) => {
            try {
                const pageURL = `${novelURL}?page=${pageNum}`;
                const pageHtml = await fetch(pageURL);
                const chapters = this.parseChapterListOptimized(pageHtml, novelURL);
                
                // Limit to 50 chapters per page
                const limitedChapters = chapters.slice(0, this.chaptersPerPage);
                
                console.log(`📖 Page ${pageNum}: Found ${chapters.length} chapters (limited to ${limitedChapters.length})`);
                return { pageNum, chapters: limitedChapters };
                
            } catch (error) {
                console.log(`❌ Error fetching page ${pageNum}: ${error}`);
                return { pageNum, chapters: [] };
            }
        });
        
        // Wait for all pages in batch to complete
        const results = await Promise.all(promises);
        
        // Sort results by page number for consistent processing
        results.sort((a, b) => a.pageNum - b.pageNum);
        
        // Add unique chapters from each page
        for (const { pageNum, chapters } of results) {
            let uniqueCount = 0;
            for (const chapter of chapters) {
                if (!seenUrls.has(chapter.url)) {
                    seenUrls.add(chapter.url);
                    batchChapters.push(chapter);
                    uniqueCount++;
                }
            }
            if (chapters.length > 0) {
                console.log(`📖 Page ${pageNum}: Added ${uniqueCount}/${chapters.length} unique chapters`);
            }
        }
        
        return batchChapters;
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
        
        // Alternative method - find highest numbered page link
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
        
        // Fallback: look for any page numbers in pagination links
        const allPageLinks = parseHTML(html, '.pagination a');
        if (allPageLinks && allPageLinks.length > 0) {
            for (const link of allPageLinks) {
                if (link.href && link.href.includes('page=')) {
                    const pageMatch = link.href.match(/page=(\d+)/);
                    if (pageMatch) {
                        const pageNum = parseInt(pageMatch[1]);
                        if (pageNum > maxPage) {
                            maxPage = pageNum;
                        }
                    }
                }
            }
        }
        
        console.log(`📊 Detected ${maxPage} total pages`);
        return maxPage;
    }
    
    parseChapterListOptimized(html, novelURL) {
        const chapters = [];
        
        // More specific selector for chapter links - target the chapter list container
        const chapterElements = parseHTML(html, '#list-chapter .row .chapter a, .list-chapter .chapter a, ul li a[href*="chapter-"]:not([href*="edit"]):not([href*="report"]):not([class*="btn"])');
        
        console.log(`🔍 Found ${chapterElements.length} chapter elements with selector`);
        
        // If we get too many or too few, try alternative selectors
        if (chapterElements.length > 60 || chapterElements.length < 30) {
            console.log(`⚠️ Unexpected chapter count (${chapterElements.length}), trying alternative selector...`);
            
            const altElements = parseHTML(html, 'li a[href*="chapter-"]:not([href*="edit"]):not([class*="btn"])');
            console.log(`🔍 Alternative selector found ${altElements ? altElements.length : 0} elements`);
            
            if (altElements && altElements.length >= 30 && altElements.length <= 60) {
                return this.parseChapterElements(altElements, novelURL);
            }
        }
        
        return this.parseChapterElements(chapterElements, novelURL);
    }

    parseChapterElements(chapterElements, novelURL) {
        const chapters = [];
        
        // Limit to expected chapters per page
        const elementsToProcess = Math.min(chapterElements.length, this.chaptersPerPage);
        console.log(`🔍 After filtering: ${elementsToProcess} unique chapter links`);
        
        for (let i = 0; i < elementsToProcess; i++) {
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
                
                // Log first few chapters for debugging
                if (i < 3) {
                    console.log(`📖 Chapter ${chapterNumber}: ${chapterTitle} -> ${chapterURL}`);
                }
                
            } catch (error) {
                console.log(`❌ Error parsing chapter ${i}: ${error}`);
            }
        }
        
        console.log(`✅ Successfully parsed ${chapters.length} chapters`);
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
