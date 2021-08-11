import * as github from '@actions/github'

export function getRef(): string {
  const pullRequestEvents = [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]
  if (pullRequestEvents.includes(github.context.eventName)) {
    const prEvent = github.context.payload.pull_request as unknown as any
    return prEvent.head.sha
  }
  return github.context.sha
}
