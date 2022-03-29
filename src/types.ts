export type NotedId = number
export type ModelName = string
export type DeckName = string
export type Fields = Record<string, string>
export type Tag = string
export type Tags = Array<Tag>

export interface Media {
    url: string,
    filename: string,
    skipHash: string,
    fields: string[],
}

export interface Note {
    id?: NotedId,
    deckName: DeckName;
    tags: Tags;
    options?: {
        allowDuplicate: boolean;
        duplicateScope?: 'deckName' | unknown;
    }
    fields: Fields;
    modelName: ModelName;
    audio?: Array<Media>;
    video?: Array<Media>;
    picture?: Array<Media>;
}