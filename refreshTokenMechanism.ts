// Flag to indicate if a token refresh is currently in progress
let isRefreshing = false;

// Queue to hold failed requests while a token refresh is in progress
let failedReqQueue = [];

/**
 * This function processes the queue of failed requests.
 * If there is an error, it rejects all promises in the queue.
 * If a fresh token is available, it resolves the promises with the new token and retries the API call for each request in the queue.
 * @param {Object} error - The error encountered during the token refresh process.
 * @param {string|null} freshToken - The new access token, if available.
 */
const processQueue = (error, freshToken = null) => {
  failedReqQueue.forEach((failedReqPromise) => {
    if (error) {
      failedReqPromise.reject(error);
    } else {
      failedReqPromise.resolve(freshToken);
    }
  });

  // Clear the queue after processing
  failedReqQueue = [];
};

// Axios response interceptor to handle token refresh mechanism
axios.interceptors.response.use(
  (response) => {
    // Return the response if the request is successful
    return response;
  },
  async (error) => {
    // Store the original request configuration to retry it later
    const originalRequest = error.config;

    // Check if the error status is 401 (Unauthorized) and if the request hasn't been retried yet
    if (error?.response?.status === "401" && !originalRequest._retry) {
      if (isRefreshing) {
        // If a token refresh is already in progress, add the request to the queue
        return new Promise(function (resolve, reject) {
          failedReqQueue.push({ resolve, reject });
        })
          .then((token) => {
            // Update the original request with the new token and retry the request
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axios(originalRequest);
          })
          .catch((failedQueueError) => {
            // Handle any errors that occur while processing the queue
            Promise.reject(failedQueueError);
          });
      }

      // Mark the original request as a retry and start the token refresh process
      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise(function (resolve, reject) {
        // Replace this part with your own method of handling token refresh according to your structure and requirements.
        // In this example, I'm using Redux to manage the token refresh mechanism.

        // Get the refresh token from the Redux store
        const refreshToken = store.getState()?.auth?.user?.refreshToken;

        // Dispatch an action to refresh the access token through the refresh token
        store.dispatch(
          AuthActions.refreshTokenRequest({
            refreshToken,
          })
        );

        // Subscribe to the Redux store to handle the result of the token refresh action
        const unsubscribe = store.subscribe(() => {
          const state = store.getState();
          if (!state.auth.refreshTokenError?.message) {
            // If the token refresh is successful, update the original request with the new token
            const freshAccessToken = state.auth.user?.accessToken ?? "";
            originalRequest.headers.Authorization = `Bearer ${freshAccessToken}`;

            // Process the queue with the new token and resolve the original request
            processQueue(null, freshAccessToken);
            resolve(axios(originalRequest));
            isRefreshing = false;

            // Unsubscribe from the store updates
            unsubscribe();
          } else {
            // If there is an error during the token refresh, process the queue with the error
            const refreshTokenError = state.auth.refreshTokenError;
            processQueue(refreshTokenError, null);
            reject(refreshTokenError);
            isRefreshing = false;

            // Unsubscribe from the store updates
            unsubscribe();
          }
        });
      });
    } else {
      // If the error is not a 401 or the request has already been retried, return the error
      return error;
    }
  }
);
