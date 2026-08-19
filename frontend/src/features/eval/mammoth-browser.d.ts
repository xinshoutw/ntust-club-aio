declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
  export default mammoth
}
