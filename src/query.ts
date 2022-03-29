import '@logseq/libs';
import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { map, get } from "lodash";
import { Block } from './types';

export async function getBlocksByTag(tag: string): Block[] {
  const blocks = (await logseq.DB.datascriptQuery(`
            [:find (pull ?b [*])
            :where
            [?p :block/name "${tag}"]
            [?b :block/refs ?p]]
            `))
    .flat()

  const result = await Promise.all(map(blocks, completeBlock))
  return result
}

/**
* it would do following things
* 1. get pageEntity
* 2. extract tags with given
*/
async function completeBlock(block: BlockEntity): Promise<Block>{
  const uuid = block.uuid["$uuid$"]
  const { Editor: { getBlock, getPage }, } = logseq

  block = {
    ...block,
    ...(await getBlock(uuid, { includeChildren: true })),
  }

  block.pageContent = block.page
    ? (await getPage(block.page.id))
    : {}

  const { refs = [] } = block
  const tags = await Promise.all(map(
    refs,
    async page => get(await getPage(page.id), 'name')))
  block.tags = tags || []

  return block
}
