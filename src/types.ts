import { BlockEntity, BlockUUID } from "@logseq/libs/dist/LSPlugin.user"

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

export type TagWithModel = [Tag, ModelName]

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

export interface Block extends BlockEntity {
    refs: Array<BlockUUID>,
    tags: Tags,
}

export interface Response {
    result: any;
    error: string;
}

export interface AddNotesResponse extends Response {
    result: Array<NotedId | null>
}
