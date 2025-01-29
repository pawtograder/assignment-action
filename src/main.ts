/* eslint-disable prettier/prettier */
import * as core from '@actions/core'
import { submitAssignment } from './api/adminServiceComponents.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    //Get an OIDC token
    // const token = await core.getIDToken()
    const token =
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6Ikh5cTROQVRBanNucUM3bWRydEFoaHJDUjJfUSIsImtpZCI6IjFGMkFCODM0MDRDMDhFQzlFQTBCQjk5REFFRDAyMTg2QjA5MURCRjQifQ.eyJqdGkiOiI2NDBhYjIyYi1hNDQ0LTQwODgtOTIzMi01ZGRmNjkwOGQxYjQiLCJzdWIiOiJyZXBvOm5ldS1zZS9hdXRvZ3JhZGVyLWFjdGlvbjpyZWY6cmVmcy9oZWFkcy9tYWluIiwiYXVkIjoiaHR0cHM6Ly9naXRodWIuY29tL25ldS1zZSIsInJlZiI6InJlZnMvaGVhZHMvbWFpbiIsInNoYSI6Ijg3MDk0ZWE0NzU2YTg0ZWI3NjhiZTIyYTQzYmZlZDcxZWVlY2Q0NzIiLCJyZXBvc2l0b3J5IjoibmV1LXNlL2F1dG9ncmFkZXItYWN0aW9uIiwicmVwb3NpdG9yeV9vd25lciI6Im5ldS1zZSIsInJlcG9zaXRvcnlfb3duZXJfaWQiOiI3NjQ5MTA5NiIsInJ1bl9pZCI6IjEzMDIzMDQ1NzQ4IiwicnVuX251bWJlciI6IjEyIiwicnVuX2F0dGVtcHQiOiIyIiwicmVwb3NpdG9yeV92aXNpYmlsaXR5IjoicHVibGljIiwicmVwb3NpdG9yeV9pZCI6IjkyMjc2MTg0NiIsImFjdG9yX2lkIjoiMjEzMDE4NiIsImFjdG9yIjoiam9uLWJlbGwiLCJ3b3JrZmxvdyI6IkNvbnRpbnVvdXMgSW50ZWdyYXRpb24iLCJoZWFkX3JlZiI6IiIsImJhc2VfcmVmIjoiIiwiZXZlbnRfbmFtZSI6InB1c2giLCJyZWZfcHJvdGVjdGVkIjoiZmFsc2UiLCJyZWZfdHlwZSI6ImJyYW5jaCIsIndvcmtmbG93X3JlZiI6Im5ldS1zZS9hdXRvZ3JhZGVyLWFjdGlvbi8uZ2l0aHViL3dvcmtmbG93cy9jaS55bWxAcmVmcy9oZWFkcy9tYWluIiwid29ya2Zsb3dfc2hhIjoiODcwOTRlYTQ3NTZhODRlYjc2OGJlMjJhNDNiZmVkNzFlZWVjZDQ3MiIsImpvYl93b3JrZmxvd19yZWYiOiJuZXUtc2UvYXV0b2dyYWRlci1hY3Rpb24vLmdpdGh1Yi93b3JrZmxvd3MvY2kueW1sQHJlZnMvaGVhZHMvbWFpbiIsImpvYl93b3JrZmxvd19zaGEiOiI4NzA5NGVhNDc1NmE4NGViNzY4YmUyMmE0M2JmZWQ3MWVlZWNkNDcyIiwicnVubmVyX2Vudmlyb25tZW50IjoiZ2l0aHViLWhvc3RlZCIsImVudGVycHJpc2VfaWQiOiI1MjEiLCJlbnRlcnByaXNlIjoibm9ydGhlYXN0ZXJuLXVuaXZlcnNpdHkiLCJpc3MiOiJodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tIiwibmJmIjoxNzM4MTE0NzYzLCJleHAiOjE3MzgxMTU2NjMsImlhdCI6MTczODExNTM2M30.u4T7ZbaNKCC94ibzwy0HpL_hK4HahA36gIt0F2OZ2A62XBggOhAX47rukue5rV5ZL196LcOKzfyYlOEkEVKVURtQayVDR5zSLqJOOa9wmEUdVsMZHdPmlbI68m5SfUespZRg-7tsjAKnqQudTB6xcPRrstZIKi5mzS7Y8x3jC0tVCenfMXJ-ZcrOrqJeinx6l1LCpUWjUUTRZ4LCgN__On24PmqjT7MutXpInufj2gCgQW7qe4GLfzkeuMVc0_D_HA6mpYyNSL1tG9rkdJGcDqsgsI2abWiyl2gkjW0pqD4SUqOJJb4zCgWf-yVrRA_OdNLG8wHkJPVWIwHq47gYUg'
    // console.log('Token:', token)
    submitAssignment({
      body: {
        score: 4,
        execution_time: 5,
        tests: [],
        output: {}
      },
      headers: {
        Authorization: token
      }
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
