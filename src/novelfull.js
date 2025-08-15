// @id novelfull
// @name NovelFull
// @version 1.0.0
// @description Read novels from NovelFull.net
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
            
            // Handle different query types
            switch(query.toLowerCase()) {
                case 'popular':
                    url = `${this.baseURL}/hot-novel`;
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

    parseNovelList(html, queryType) {
        try {
            // Create a temporary DOM element to parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const novels = [];
            let novelElements;
            
            // Different selectors based on page type
            if (queryType === 'search') {
                novelElements = doc.querySelectorAll('.list-truyen .row');
            } else {
                novelElements = doc.querySelectorAll('.list.list-truyen .row');
            }
            
            console.log(`Found ${novelElements.length} novel elements`);
            
            novelElements.forEach((element, index) => {
                try {
                    const titleElement = element.querySelector('.truyen-title a') || element.querySelector('h3 a');
                    if (!titleElement) return;
                    
                    const title = titleElement.textContent.trim();
                    const novelURL = this.resolveURL(titleElement.getAttribute('href'));
                    
                    // Get cover image
                    const coverElement = element.querySelector('.book img');
                    let coverURL = null;
                    if (coverElement) {
                        coverURL = coverElement.getAttribute('data-src') || coverElement.getAttribute('src');
                        coverURL = this.resolveURL(coverURL);
                    }
                    
                    // Get author if available
                    const authorElement = element.querySelector('.author');
                    const author = authorElement ? authorElement.textContent.trim() : null;
                    
                    // Get synopsis if available
                    const synopsisElement = element.querySelector('.desc');
                    const synopsis = synopsisElement ? synopsisElement.textContent.trim() : null;
                    
                    const novel = {
                        id: `novelfull_${Date.now()}_${index}`,
                        title: title,
                        author: author,
                        synopsis: synopsis,
                        coverImageURL: coverURL,
                        sourcePlugin: this.id,
                        novelURL: novelURL
                    };
                    
                    novels.push(novel);
                    
                } catch (error) {
                    console.log(`Error parsing novel element: ${error}`);
                }
            });
            
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
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Parse novel information
            const titleElement = doc.querySelector('h3.title');
            const title = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
            
            const authorElement = doc.querySelector('.info a[href*="author"]');
            const author = authorElement ? authorElement.textContent.trim() : null;
            
            const synopsisElement = doc.querySelector('.desc-text');
            const synopsis = synopsisElement ? synopsisElement.textContent.trim() : null;
            
            const coverElement = doc.querySelector('.book img');
            let coverURL = null;
            if (coverElement) {
                coverURL = coverElement.getAttribute('data-src') || coverElement.getAttribute('src');
                coverURL = this.resolveURL(coverURL);
            }
            
            // Parse chapters
            const chapters = this.parseChapterList(doc, novelURL);
            
            const novel = {
                id: `novelfull_${Date.now()}`,
                title: title,
                author: author,
                synopsis: synopsis || 'No synopsis available',
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

    parseChapterList(doc, novelURL) {
        const chapters = [];
        const chapterElements = doc.querySelectorAll('#list-chapter .row a');
        
        chapterElements.forEach((element, index) => {
            try {
                const chapterTitle = element.textContent.trim();
                const chapterURL = this.resolveURL(element.getAttribute('href'));
                
                // Extract chapter number from title
                let chapterNumber = index + 1;
                const numberMatch = chapterTitle.match(/\d+/);
                if (numberMatch) {
                    chapterNumber = parseInt(numberMatch[0]);
                }
                
                const chapter = {
                    id: `chapter_${Date.now()}_${index}`,
                    title: chapterTitle,
                    novelId: novelURL,
                    chapterNumber: chapterNumber,
                    url: chapterURL,
                    content: null,
                    isDownloaded: false
                };
                
                chapters.push(chapter);
                
            } catch (error) {
                console.log(`Error parsing chapter: ${error}`);
            }
        });
        
        console.log(`Parsed ${chapters.length} chapters`);
        return chapters;
    }

    async fetchChapterContent(chapterURL) {
        try {
            console.log(`Fetching chapter content from: ${chapterURL}`);
            const html = await fetch(chapterURL);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Try different selectors for chapter content
            const contentSelectors = ['#chapter-content', '.chapter-content', '#content', '.content'];
            
            for (const selector of contentSelectors) {
                const contentElement = doc.querySelector(selector);
                if (contentElement) {
                    // Clean up the content
                    let content = contentElement.textContent.trim();
                    
                    // Remove common unwanted text
                    content = content.replace(/\n\s*\n/g, '\n\n'); // Clean up extra newlines
                    content = content.replace(/^\s+|\s+$/g, ''); // Trim
                    
                    if (content.length > 100) { // Ensure meaningful content
                        console.log(`Successfully fetched chapter content (${content.length} characters)`);
                        return content;
                    }
                }
            }
            
            // Fallback: get all paragraph content
            const paragraphs = doc.querySelectorAll('p');
            let content = '';
            paragraphs.forEach(p => {
                const text = p.textContent.trim();
                if (text.length > 50) {
                    content += text + '\n\n';
                }
            });
            
            return content || 'Chapter content could not be loaded';
            
        } catch (error) {
            console.log(`Error fetching chapter content: ${error}`);
            return 'Failed to load chapter content';
        }
    }
}
