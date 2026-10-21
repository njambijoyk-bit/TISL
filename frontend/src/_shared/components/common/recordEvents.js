/** A record was loaded or changed on a detail page: lists beside it (RecordSidebar) refresh. */
export const notifyRecordsChanged = () => window.dispatchEvent(new Event('records:changed'));
