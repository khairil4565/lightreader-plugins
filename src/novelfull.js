// @id novelfull
// @name NovelFull
// @version 1.0.1
// @description Read novels from NovelFull.net with improved cover image handling
// @author khairil4565
// @website https://novelfull.net

class NovelFullPlugin extends BasePlugin {
    constructor(config) {
        super(config);
        this.baseURL = 'https://novelfull.net';
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
                    
                    // Get cover image - try multiple approaches
                    let coverURL = await this.getCoverImageURL(element.html, novelURL, title);
                    
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

    async getCoverImageURL(elementHtml, novelURL, title) {
        try {
            // First, try to get cover from the list page element
            const listCoverElements = parseHTML(elementHtml, '.book img, .cover img, img');
            if (listCoverElements && listCoverElements.length > 0) {
                for (const coverElement of listCoverElements) {
                    const src = coverElement.src || coverElement['data-src'];
                    if (src) {
                        let coverURL = this.resolveURL(src);
                        // Convert to full size if it's a thumbnail
                        coverURL = this.getFullSizeCoverURL(coverURL);
                        if (coverURL) {
                            console.log(`Found cover from list page for ${title}: ${coverURL}`);
                            return coverURL;
                        }
                    }
                }
            }

            // If not found or is thumbnail, fetch from detail page
            console.log(`Fetching detail page for better cover: ${title}`);
            const detailHtml = await fetch(novelURL);
            
            // Try multiple selectors for cover images
            const detailSelectors = [
                '.book img',
                '.cover img', 
                '.info-holder .book img',
                '.novel-cover img',
                'img[src*="cover"]',
                'img[src*="upload"]'
            ];
            
            for (const selector of detailSelectors) {
                const coverElements = parseHTML(detailHtml, selector);
                if (coverElements && coverElements.length > 0) {
                    for (const coverElement of coverElements) {
                        const src = coverElement.src || coverElement['data-src'];
                        if (src && (src.includes('cover') || src.includes('upload') || src.includes('novel'))) {
                            let coverURL = this.resolveURL(src);
                            coverURL = this.getFullSizeCoverURL(coverURL);
                            if (coverURL) {
                                console.log(`Found cover from detail page for ${title}: ${coverURL}`);
                                return coverURL;
                            }
                        }
                    }
                }
            }
            
            console.log(`No cover found for ${title}`);
            return null;
            
        } catch (error) {
            console.log(`Error getting cover for ${title}: ${error}`);
            return null;
        }
    }

    getFullSizeCoverURL(thumbnailURL) {
        if (!thumbnailURL) return null;
        
        let fullSizeURL = thumbnailURL;
        
        // Convert thumbnail to full size
        if (thumbnailURL.includes('/thumbs/')) {
            // NovelFull pattern: /thumbs/book-name-hash-hash.jpg -> /novel/book-name.jpg
            fullSizeURL = thumbnailURL
                .replace('/thumbs/', '/novel/')
                .replace(/-[a-f0-9]{10,}-[a-f0-9]{32}\.jpg$/, '.jpg')
                .replace(/-[a-f0-9]{10,}-[a-f0-9]{32}\.png$/, '.png')
                .replace(/-[a-f0-9]{10,}\.jpg$/, '.jpg')
                .replace(/-[a-f0-9]{10,}\.png$/, '.png');
        }
        
        // Additional cleaning for direct novel URLs
        if (fullSizeURL.includes('/novel/')) {
            // Remove any hash suffixes that might still be there
            fullSizeURL = fullSizeURL.replace(/-[a-f0-9]{8,}\.jpg$/, '.jpg');
            fullSizeURL = fullSizeURL.replace(/-[a-f0-9]{8,}\.png$/, '.png');
        }
        
        // Ensure we have a valid image extension
        if (!fullSizeURL.match(/\.(jpg|jpeg|png|webp)$/i)) {
            fullSizeURL += '.jpg';
        }
        
        console.log(`Cover URL conversion: ${thumbnailURL} -> ${fullSizeURL}`);
        return fullSizeURL;
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
            
            // Parse title
            const titleElements = parseHTML(html, 'h3.title, .title, h1');
            const title = (titleElements && titleElements.length > 0 && titleElements[0].text) ? 
                titleElements[0].text.trim() : 'Unknown Title';
            
            // Parse author
            const authorElements = parseHTML(html, '.info .author, .info a[href*="author"], .author');
            const author = (authorElements && authorElements.length > 0 && authorElements[0].text) ?
                authorElements[0].text.trim() : null;
            
            // Parse synopsis
            const synopsisElements = parseHTML(html, '.desc-text, .description, .summary');
            const synopsis = (synopsisElements && synopsisElements.length > 0 && synopsisElements[0].text) ?
                synopsisElements[0].text.trim() : 'No synopsis available';
            
            // Parse cover using the improved method
            const coverURL = await this.getCoverImageURL(html, novelURL, title);
            
            // Parse chapters
            const chapters = this.parseChapterList(html, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis,
                coverImageURL: coverURL,
                sourcePlugin: this.id,
                novelURL: novelURL
            };
            
            return {
                novel: novel,
                chapters: chapters,
                totalChapters: chapters.length,
                lastUpdated: new Date()
            };
            
        } catch (error) {
            console.log(`Error fetching novel details: ${error}`);
            throw error;
        }
    }

    parseChapterList(html, novelURL) {
        const chapters = [];
        const chapterElements = parseHTML(html, '#list-chapter .row a, .chapter-list a, .list-chapter a');
        
        for (let i = 0; i < chapterElements.length; i++) {
            const element = chapterElements[i];
            
            try {
                const chapterTitle = (element.text) ? element.text.trim() : `Chapter ${i + 1}`;
                const chapterURL = this.resolveURL(element.href);
                
                if (!chapterURL) continue;
                
                let chapterNumber = i + 1;
                const numberMatch = chapterTitle.match(/\d+/);
                if (numberMatch) {
                    chapterNumber = parseInt(numberMatch[0]);
                }
                
                const chapter = {
                    id: `chapter_${Date.now()}_${i}`,
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
        
        console.log(`Parsed ${chapters.length} chapters`);
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
