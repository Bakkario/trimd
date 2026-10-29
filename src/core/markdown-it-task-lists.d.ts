declare module 'markdown-it-task-lists' {
  import MarkdownIt from 'markdown-it';
  const taskLists: (md: MarkdownIt, opts?: Record<string, unknown>) => void;
  export default taskLists;
}
