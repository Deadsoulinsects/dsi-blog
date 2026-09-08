export interface TopicMeta {
	description: string;
}

export const topicMeta: Record<string, TopicMeta> = {
	SBTI: {
		description: '网络跟风制作的人格测试网页',
	},
};

export const getTopicMeta = (topic: string) => topicMeta[topic];
