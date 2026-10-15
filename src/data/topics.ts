import descriptions from './topics.json';

export interface TopicMeta {
	readonly description: string;
	readonly pinned?: boolean;
}

export const topicMeta: Record<string, TopicMeta> = descriptions;

export const getTopicMeta = (topic: string) => topicMeta[topic];

export const getPinnedTopicPath = (): string[] | null => {
	const pinned = Object.entries(topicMeta).find(([, metadata]) => metadata.pinned);
	return pinned ? pinned[0].split('/') : null;
};
