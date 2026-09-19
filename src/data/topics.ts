export interface TopicMeta {
	readonly description: string;
}

export const featuredTopics = ['SBTI', 'Obsidian'] as const;

export const topicMeta: Record<string, TopicMeta> = {
	SBTI: {
		description: '网络跟风制作的人格测试网页',
	},
	Obsidian: {
		description: '试着把本地笔记和公开文章分开，再用更稳定的方式连接起来。',
	},
};

export const getTopicMeta = (topic: string) => topicMeta[topic];
