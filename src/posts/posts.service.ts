import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { CreatePostsDto } from './dto/posts.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly Db: DatabaseService,
    @Inject('EMAIL_SERVICE') private readonly client: ClientProxy,
  ) {}

  async create(userId: number, createPostDto: CreatePostsDto) {
    try {
      const post = await this.Db.post.create({
        data: {
          ...createPostDto,
          user: { connect: { id: userId } },
        },
        include: {
          LikePost: true,
          CommentPost: true,
        },
      });
      return {
        status: true,
        data: post,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Posts with the same name already exists.',
          HttpStatus.CONFLICT,
        );
      } else {
        throw new HttpException(
          'An unexpected error occurred while creating the post.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async findAll() {
    try {
      const posts = await this.Db.post.findMany({
        include: {
          _count: {
            select: {
              LikePost: true,
              CommentPost: true,
            },
          },
          user: true,
        },
      });

      return {
        status: true,
        data: posts.map((post) => ({
          id: post.id,
          content: post.content,
          user: {
            username: post.user.username,
            email: post.user.email,
          },
          like: post._count.LikePost,
          comment: post._count.CommentPost,
          created_at: post.created_at,
          updated_at: post.updated_at,
        })),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve posts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: number) {
    try {
      const post = await this.Db.post.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              LikePost: true,
              CommentPost: true,
            },
          },
          CommentPost: {
            include: {
              user: true,
            },
          },
          user: true,
        },
      });

      if (!post) {
        throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
      }

      return {
        status: true,
        data: {
          id: post.id,
          content: post.content,
          user: {
            username: post.user.username,
            email: post.user.email,
          },
          like: post._count.LikePost,
          comment: post._count.CommentPost,
          all_comment: post.CommentPost.map((comment) => ({
            id: comment.id,
            content: comment.content,
            user: {
              username: comment.user.username,
              email: comment.user.email,
            },
            created_at: comment.created_at,
            updated_at: comment.updated_at,
          })),
          created_at: post.created_at,
          updated_at: post.updated_at,
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(
    id: number,
    userId: number,
    updatePostDto: Prisma.PostUpdateInput,
  ) {
    try {
      const post = await this.Db.post.findUnique({
        where: { id },
      });

      if (!post) {
        throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
      }

      if (post.users !== userId) {
        throw new HttpException(
          'You are not authorized to update this post',
          HttpStatus.FORBIDDEN,
        );
      }

      const updatedPost = await this.Db.post.update({
        where: { id },
        data: updatePostDto,
      });

      return {
        status: true,
        data: updatedPost,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to update post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: number, userId: number) {
    try {
      const post = await this.Db.post.findUnique({
        where: { id },
      });

      if (!post) {
        throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
      }

      if (post.users !== userId) {
        throw new HttpException(
          'You are not authorized to delete this post',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.Db.post.delete({
        where: { id },
      });

      return {
        status: true,
        message: 'Post successfully deleted',
      };
    } catch (error) {
      throw new HttpException(
        'Failed to remove post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async likePosts(postId: number, userId: number) {
    const [user, post] = await Promise.all([
      this.Db.user.findUnique({ where: { id: userId } }),
      this.Db.post.findUnique({ where: { id: postId } }),
    ]);

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    await this.Db.likePost.create({
      data: {
        user: { connect: { id: userId } },
        post: { connect: { id: postId } },
      },
    });

    return { status: true };
  }

  async commentPosts(postId: number, userId: number, content: string) {
    const [user, post] = await Promise.all([
      this.Db.user.findUnique({ where: { id: userId } }),
      this.Db.post.findUnique({ where: { id: postId } }),
    ]);

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    try {
      await this.Db.commentPost.create({
        data: {
          content,
          user: { connect: { id: userId } },
          post: { connect: { id: postId } },
        },
      });

      return { status: true };
    } catch (error) {
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { status: true };
  }

  //async sendEmailLike(data: any) {
  //  try {
  //    const result = await this.client.send('email', data).toPromise();
  //    return result;
  //  } catch (error) {
  //    Logger.log(error);
  //    throw new error();
  //  }
  //}
}
