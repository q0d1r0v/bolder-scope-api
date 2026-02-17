import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, error, message } = this.extractErrorInfo(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${statusCode} — ${typeof message === 'string' ? message : JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private extractErrorInfo(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          error: HttpStatus[statusCode] ?? 'Error',
          message: exceptionResponse,
        };
      }

      const responseObj = exceptionResponse as Record<string, unknown>;
      const message = (responseObj.message as string | string[]) ?? exception.message;
      const error = (responseObj.error as string) ?? HttpStatus[statusCode] ?? 'Error';

      return { statusCode, error, message };
    }

    const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: isProduction ? 'An unexpected error occurred' : this.getExceptionMessage(exception),
    };
  }

  private getExceptionMessage(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'An unexpected error occurred';
  }
}
