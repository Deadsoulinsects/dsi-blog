export type FieldContentType = 'note' | 'essay' | 'reference';

export type FieldNavKey = 'home' | 'blog' | 'docs' | 'projects' | 'archive' | 'categories';

export type NotebookView = 'home' | 'blog' | 'article';

export type SecondaryView = 'docs' | 'projects' | 'archive' | 'categories' | 'not-found';

export type FieldEntry = {
	readonly slug: string;
	readonly title: string;
	readonly summary?: string;
	readonly date: string;
	readonly readTime: string;
	readonly tags: readonly string[];
	readonly category: string;
	readonly type: FieldContentType;
	readonly href: string;
};

export type FieldProject = {
	readonly code: string;
	readonly status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
	readonly title: string;
	readonly note: string;
	readonly href: string;
};

export type FieldTocItem = {
	readonly id: string;
	readonly label: string;
	readonly depth: 2 | 3;
};
