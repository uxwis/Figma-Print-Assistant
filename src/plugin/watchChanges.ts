// Page-scoped events support dynamic-page access without loading the whole file.
export function watchCurrentPageChanges(onChange:()=>void,onError:(error:unknown)=>void):()=>void {
  let watchedPage:PageNode|null=null
  let generation=0
  let closed=false
  const nodeChanged=()=>onChange()

  function detachPage() {
    if(watchedPage && !watchedPage.removed) watchedPage.off('nodechange',nodeChanged)
    watchedPage=null
  }
  async function bindCurrentPage() {
    const request=++generation,page=figma.currentPage
    detachPage()
    try {
      await page.loadAsync()
      // Page switches and plugin closure can happen while the page is loading.
      if(closed || request!==generation || page!==figma.currentPage || page.removed) return
      page.on('nodechange',nodeChanged)
      watchedPage=page
    } catch(error) {
      if(!closed && request===generation && page===figma.currentPage) onError(error)
    }
  }
  const pageChanged=()=>{onChange();void bindCurrentPage()}
  const styleChanged=()=>onChange()
  function stop() {
    if(closed) return
    closed=true;generation++
    detachPage()
    figma.off('currentpagechange',pageChanged)
    figma.off('stylechange',styleChanged)
    figma.off('close',stop)
  }
  figma.on('currentpagechange',pageChanged)
  figma.on('stylechange',styleChanged)
  figma.on('close',stop)
  void bindCurrentPage()
  return stop
}
