import '@logseq/libs';
import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { map, get } from "lodash";

export async function getBlockByTag(tag: string) {
  const blocks = (await logseq.DB.datascriptQuery(`
            [:find (pull ?b [*])
            :where
            [?p :block/name "${tag}"]
            [?b :block/refs ?p]]
            `))
    .flat()

  /**
   * it would do following things
   * 1. get pageEntity
   * 2. extract tags with given
   */
  async function transformBlock(block: BlockEntity) {
    const uuid = block.uuid["$uuid$"]
    const { Editor: { getBlock, getPage, } } = logseq

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

    // const { children } = block
    // block.children = await Promise.all(map(children, transformBlock)) || children

    return block
  }
  return Promise.all(map(blocks, transformBlock))
}
