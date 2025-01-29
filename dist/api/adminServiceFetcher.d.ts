export type AdminServiceFetcherExtraProps = {};
export type ErrorWrapper<TError> = TError | {
    status: 'unknown';
    payload: string;
};
export type AdminServiceFetcherOptions<TBody, THeaders, TQueryParams, TPathParams> = {
    url: string;
    method: string;
    body?: TBody;
    headers?: THeaders;
    queryParams?: TQueryParams;
    pathParams?: TPathParams;
    signal?: AbortSignal;
} & AdminServiceFetcherExtraProps;
export declare function adminServiceFetch<TData, TError, TBody extends {} | FormData | undefined | null, THeaders extends {}, TQueryParams extends {}, TPathParams extends {}>({ url, method, body, headers, pathParams, queryParams, signal }: AdminServiceFetcherOptions<TBody, THeaders, TQueryParams, TPathParams>): Promise<TData>;
